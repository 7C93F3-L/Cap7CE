import type { MetadataBuildProgress, MetadataBuildStatus } from "../../src/shared/metadataBuildTypes";
import { directoryBuildPath, type MetadataDirectoryJob, type MetadataDirectoryQueue } from "../metadataDirectoryBuildStore";
import type { CoreCatalogStatus } from "../core/coreProductProtocolTypes";
import type { CoreMetadataProtocol } from "../core/coreMetadataProtocol";
import type { MetadataBuildOwner, MetadataBuildRuntime, MetadataBuildRuntimeOptions } from "./metadataBuildRuntime";
import { MetadataBuildController } from "./metadataBuildController";
import { resolveMetadataDirectory } from "./metadataDirectoryScope";
import { directoryStoreError } from "../metadataDirectoryStoreError";

const emptyProgress = (): MetadataBuildProgress => ({ phase: "preparing", volumeId: null, discovered: 0, processed: 0,
  failed: 0, unsupported: 0, total: null, progressFraction: null, remainingSeconds: null, errorCode: null });

// A directory sweep borrows the single Host session. Global grants/settings remain owned by the existing runtime.
export function attachMetadataDirectoryBuilds(owner: MetadataBuildOwner, protocol: CoreMetadataProtocol,
  options: MetadataBuildRuntimeOptions, readCatalog: () => Promise<CoreCatalogStatus>): MetadataBuildRuntime {
  let queue: MetadataDirectoryQueue = { version: 1, intent: "active", jobs: [] };
  let loading: Promise<void> | undefined, running: Promise<void> | undefined, cancellation: AbortController | undefined;
  let closing = false, suspended = false, saving = 0, current: MetadataDirectoryJob | undefined, progress = emptyProgress();
  let actionRevision = 0, directoryRevision = 0;
  const controller = new MetadataBuildController(protocol, { ...options, onProgress(value) { progress = value; options.onProgress?.(value); } });
  const load = () => loading ??= (async () => {
    const saved = await options.directoryStore?.load(); if (saved) queue = saved;
    if (queue.jobs.length) { current = queue.jobs[0]; progress.phase = queue.intent === "paused" ? "paused" : "preparing"; }
  })();
  const save = async () => {
    saving++;
    try { await options.directoryStore?.save(structuredClone(queue)); }
    catch (cause) {
      queue.intent = "paused"; cancellation?.abort(); await controller.pause();
      const error = directoryStoreError(cause, "write");
      progress = { ...progress, phase: "failed", errorCode: error.message, storageError: error.details };
      throw error;
    }
    finally { saving--; }
  };
  const snapshot = (base: MetadataBuildStatus): MetadataBuildStatus => {
    const baseActive = !["idle", "completed", "paused", "failed"].includes(base.progress.phase);
    return current && (queue.jobs.length || running || !base.policy && !baseActive || progress.phase === "failed")
      ? { ...base, progress: { ...progress }, directoryTask: { path: current.path, pending: queue.jobs.length } } : base;
  };
  const status = async () => { await load(); return snapshot(await owner.status()); };
  const kick = () => {
    if (running || closing || saving || queue.intent !== "active" || !queue.jobs.length) return;
    const abort = new AbortController(); cancellation = abort;
    running = (async () => {
      try {
        if (!suspended) { suspended = true; await owner.suspendForDirectory(); }
        while (!closing && queue.intent === "active" && queue.jobs.length) {
          abort.signal.throwIfAborted(); current = queue.jobs[0]; progress = emptyProgress();
          current.scope = await resolveMetadataDirectory(current, readCatalog, options.resolveScope, abort.signal,
            () => { progress.phase = "waiting"; }, options.waitMs);
          await save(); abort.signal.throwIfAborted();
          const scope = current.scope;
          controller.start({ volumeOrder: [scope.volumeId], includes: [scope], excludes: [] }, true);
          await controller.waitForIdle(); abort.signal.throwIfAborted();
          if (progress.phase !== "completed") throw new Error(progress.errorCode ?? "metadata-directory-failed");
          queue.jobs.shift(); await save();
        }
        if (!queue.jobs.length && !closing && !abort.signal.aborted) { await owner.releaseDirectory(); suspended = false; }
      } catch (error) {
        if (!abort.signal.aborted) {
          queue.intent = "paused";
          progress = { ...progress, phase: "failed", errorCode: error instanceof Error && /^metadata-[a-z-]+$/.test(error.message) ? error.message : "metadata-directory-failed" };
          try { await save(); } catch { progress.errorCode = "metadata-directory-state-unavailable"; }
        }
      }
    })().finally(() => { running = undefined; cancellation = undefined; if (queue.intent === "active") kick(); });
  };
  const pause = async (persist = true) => {
    if (persist) queue.intent = "paused";
    cancellation?.abort(); await controller.pause(); await running;
    if (persist) await save();
    if (queue.jobs.length) progress = { ...progress, phase: "paused", errorCode: null, remainingSeconds: null };
  };
  return {
    resolveScope: path => owner.resolveScope(path), status,
    async startDirectory(request) {
      const revision = directoryRevision;
      actionRevision++;
      await load(); if (closing || request?.allowMetadataExtraction !== true) throw new Error("metadata-build-confirmation-required");
      const path = directoryBuildPath(request.path);
      if (!queue.jobs.some(job => job.path.toLowerCase() === path.toLowerCase())) {
        if (queue.jobs.length >= 32) throw new Error("metadata-directory-queue-full");
        const base = await owner.status(), resolved = await options.resolveScope?.(path);
        if (revision !== directoryRevision || closing) throw new Error("metadata-build-start-cancelled");
        if (!resolved || resolved.volumeId && !base.volumes.some(volume => volume.volumeId === resolved.volumeId)) throw new Error("metadata-directory-unavailable");
        const job: MetadataDirectoryJob = { path, ...(resolved.resolved && resolved.volumeId ? { scope: { volumeId: resolved.volumeId, rootFileReference: resolved.rootFileReference } } : {}) };
        if (queue.jobs.some(item => item.path.toLowerCase() === path.toLowerCase())) return status();
        if (queue.jobs.length >= 32) throw new Error("metadata-directory-queue-full");
        if (!queue.jobs.length) { queue.intent = "active"; current = { path }; progress = emptyProgress(); }
        queue.jobs.push(job); await save();
      }
      kick(); return status();
    },
    async start(request) {
      const revision = ++actionRevision;
      if (!options.directoryStore && !queue.jobs.length && !running) { current = undefined; return owner.start(request); }
      await load(); if (queue.jobs.length) throw new Error("metadata-directory-busy");
      if (running) await running;
      if (revision !== actionRevision || closing) throw new Error("metadata-build-start-cancelled");
      if (queue.jobs.length) throw new Error("metadata-directory-busy");
      current = undefined; return owner.start(request);
    },
    async pause() {
      actionRevision++; directoryRevision++;
      if (!options.directoryStore && !queue.jobs.length && !running) { current = undefined; return owner.pause(); }
      await load(); if (queue.jobs.length || running) { await pause(); if (queue.jobs.length) return status(); }
      current = undefined; return owner.pause();
    },
    async resume() {
      await load(); if (!queue.jobs.length) { current = undefined; return owner.resume(); }
      queue.intent = "active"; progress = emptyProgress(); await save(); kick(); return status();
    },
    async cancelDirectories() {
      directoryRevision++;
      await load(); await pause(); queue.jobs = []; await save(); current = undefined;
      if (suspended) { await owner.releaseDirectory(); suspended = false; }
      return owner.status();
    },
    async restore() { await load(); if (queue.jobs.length) kick(); else await owner.restore(); },
    async notifyCatalogChange() { await load(); if (!queue.jobs.length && !running) await owner.notifyCatalogChange(); },
    async shutdown() { closing = true; actionRevision++; directoryRevision++; await load(); await pause(false); await owner.shutdown(); }
  };
}
