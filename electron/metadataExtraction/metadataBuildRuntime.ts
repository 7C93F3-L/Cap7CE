import type { MetadataBuildApi, MetadataBuildPolicy, MetadataBuildStatus } from "../../src/shared/metadataBuildTypes";
import type { CoreCatalogStatus, CoreResolvedScope } from "../core/coreProductProtocolTypes";
import { CoreMetadataProtocol } from "../core/coreMetadataProtocol";
import { MetadataBuildController, type MetadataBuildOptions } from "./metadataBuildController";
import type { MetadataBuildPreferenceStore } from "../metadataBuildPreferences";

import { MetadataBuildLifecycle } from "../metadataBuildLifecycle";
import { MetadataChangeDrain } from "./metadataChangeDrain";
import { attachMetadataDirectoryBuilds } from "./metadataDirectoryBuildRuntime";
import type { MetadataDirectoryStore } from "../metadataDirectoryBuildStore";

export interface MetadataBuildRuntime extends MetadataBuildApi {
  restore(): Promise<void>;
  shutdown(): Promise<void>;
  notifyCatalogChange(): Promise<void>;
}
export interface MetadataBuildOwner extends Omit<MetadataBuildRuntime, "startDirectory" | "cancelDirectories"> {
  suspendForDirectory(): Promise<void>;
  releaseDirectory(): Promise<void>;
}
// Shares the authenticated Host. Only the product owner restores a saved active grant; status stays read-only.
export interface MetadataBuildRuntimeOptions extends MetadataBuildOptions {
  resolveScope?: (path: string) => Promise<CoreResolvedScope>;
  preferences?: MetadataBuildPreferenceStore;
  directoryStore?: MetadataDirectoryStore;
}
export const createMetadataBuildRuntime = (protocol: CoreMetadataProtocol,
  readCatalog: () => Promise<CoreCatalogStatus>, options: MetadataBuildRuntimeOptions = {}): MetadataBuildRuntime => {
  const lifecycle = new MetadataBuildLifecycle(options.preferences);
  let savedIntent: "configured" | "active" | "paused" | "completed" | null = null;
  let restorationError: string | null = null;
  let restoration: Promise<void> | undefined;
  let maintenanceEnabled = false;
  let initialSweep = false;
  let drain: MetadataChangeDrain;
  const controller = new MetadataBuildController(protocol, { ...options, onProgress(progress) {
    options.onProgress?.(progress);
    if (progress.phase === "completed" || progress.phase === "failed") {
      savedIntent = progress.phase === "completed" ? "completed" : "paused";
      void lifecycle.setIntent(savedIntent).catch(() => { restorationError = "metadata-build-preferences-unavailable"; });
      if (initialSweep) { initialSweep = false; if (progress.phase === "completed") drain.notify(); }
    }
  } });
  let volumes: MetadataBuildStatus["volumes"] = [];
  let policy: MetadataBuildPolicy | null = null;
  const scopeLabels: Record<string, string> = {};
  let preparing = false;
  let revision = 0;
  let loading: Promise<void> | undefined;
  drain = new MetadataChangeDrain(controller, () => maintenanceEnabled && !preparing && policy
    && (savedIntent === "active" || savedIntent === "completed") ? policy : null,
    () => { maintenanceEnabled = false; restorationError = "metadata-build-maintenance-failed"; });
  const loadPreferences = () => loading ??= (async () => {
    const saved = await lifecycle.load();
    if (saved) { savedIntent = saved.intent; policy = saved.policy; Object.assign(scopeLabels, saved.scopeLabels); }
  })();
  const progress = () => {
    const current = controller.snapshot();
    return restorationError ? { ...current, phase: "failed" as const, errorCode: restorationError }
      : savedIntent === "configured" ? { ...current, phase: "idle" as const }
      : savedIntent === "paused" && ["idle", "completed"].includes(current.phase) ? { ...current, phase: "paused" as const }
      : current.phase === "idle" && savedIntent === "completed" ? { ...current, phase: "completed" as const } : current;
  };
  const snapshot = (): MetadataBuildStatus => ({ progress: progress(), volumes: volumes.map((item) => ({ ...item })),
    policy: policy ? JSON.parse(JSON.stringify(policy)) : null, scopeLabels: { ...scopeLabels } });
  const refreshVolumes = async () => {
    await loadPreferences();
    const catalog = await readCatalog();
    volumes = catalog.volumes.filter((volume) => volume.selected).map((volume) => ({ volumeId: volume.volumeId, label: volume.displayName }));
    return catalog;
  };
  const selectPolicy = (value: MetadataBuildPolicy): MetadataBuildPolicy => {
    const selected: MetadataBuildPolicy = structuredClone(value);
    const allowed = new Set(volumes.map(volume => volume.volumeId));
    if (!selected || !Array.isArray(selected.volumeOrder) || !Array.isArray(selected.includes) || !Array.isArray(selected.excludes)
      || !selected.volumeOrder.length || selected.volumeOrder.some(id => !allowed.has(id))
      || [...selected.includes, ...selected.excludes].some(scope => !scope || !selected.volumeOrder.includes(scope.volumeId))) throw new Error("metadata-build-invalid-policy");
    return selected;
  };
  const api: MetadataBuildOwner = {
    async resolveScope(path) {
      if (typeof path !== "string" || path.length > 32768 || !/^[A-Za-z]:[\\/]/.test(path) || !options.resolveScope) throw new Error("metadata-build-invalid-directory");
      await refreshVolumes();
      const resolved = await options.resolveScope(path);
      if (!resolved.resolved || !resolved.queryable || !resolved.volumeId || !volumes.some((volume) => volume.volumeId === resolved.volumeId)) throw new Error("metadata-build-directory-unavailable");
      scopeLabels[`${resolved.volumeId}:${resolved.rootFileReference ?? "root"}`] = path;
      return { volumeId: resolved.volumeId, rootFileReference: resolved.rootFileReference, label: path };
    },
    async status() { await refreshVolumes(); return snapshot(); },
    async savePolicy(value) {
      if (preparing || !["idle", "paused", "completed", "failed"].includes(controller.snapshot().phase)) throw new Error("metadata-build-busy");
      preparing = true;
      const ownRevision = ++revision;
      try {
        await refreshVolumes();
        const selected = selectPolicy(value);
        if (ownRevision !== revision) throw new Error("metadata-build-start-cancelled");
        maintenanceEnabled = false; initialSweep = false; drain.reset();
        await drain.waitForIdle(); await controller.waitForIdle();
        if (ownRevision !== revision) throw new Error("metadata-build-start-cancelled");
        if (policy && savedIntent !== "configured") await protocol.pause();
        await lifecycle.grant(selected, scopeLabels, true);
        policy = selected; savedIntent = "configured"; restorationError = null;
        return snapshot();
      } finally { preparing = false; }
    },
    async start(request) {
      if (request.allowMetadataExtraction !== true) throw new Error("metadata-build-confirmation-required");
      if (preparing || !["idle", "paused", "completed", "failed"].includes(controller.snapshot().phase)) throw new Error("metadata-build-busy");
      preparing = true;
      drain.reset();
      const ownRevision = ++revision;
      try {
        await drain.waitForIdle(); await controller.waitForIdle();
        await refreshVolumes();
        if (ownRevision !== revision) throw new Error("metadata-build-start-cancelled");
        const selected = selectPolicy(request.policy);
        await lifecycle.grant(selected, scopeLabels);
        savedIntent = "active"; restorationError = null;
        if (ownRevision !== revision) throw new Error("metadata-build-start-cancelled");
        policy = selected;
        maintenanceEnabled = true; initialSweep = true;
        controller.start(selected, true);
        return snapshot();
      } finally { preparing = false; }
    },
    async pause() {
      revision++; maintenanceEnabled = false; initialSweep = false; drain.reset();
      await loadPreferences();
      const dormant = ["idle", "completed", "failed", "paused"].includes(controller.snapshot().phase);
      await controller.pause(); await drain.waitForIdle();
      if (policy && savedIntent !== "configured") { await lifecycle.setIntent("paused"); savedIntent = "paused"; if (dormant) await protocol.pause(); }
      return snapshot();
    },
    async resume() {
      if (preparing) throw new Error("metadata-build-busy");
      if (!policy || progress().phase !== "paused") throw new Error("metadata-build-not-paused");
      return api.start({ allowMetadataExtraction: true, policy });
    },
    async restore() {
      let deferred = false;
      await (restoration ??= (async () => {
        const ownRevision = revision;
        const catalog = await refreshVolumes();
        if (ownRevision !== revision || preparing || !["active", "completed"].includes(savedIntent ?? "") || !policy || controller.snapshot().phase !== "idle") return;
        if (catalog.tasks?.some(task => task.state === "running") || catalog.volumes.some(volume => policy!.volumeOrder.includes(volume.volumeId)
          && ["building", "discovering", "catchingUp"].includes(volume.state))) { deferred = true; return; }
        try {
          await lifecycle.validate(catalog.volumes.filter(volume => volume.selected), options.resolveScope);
          if (ownRevision !== revision || preparing || controller.snapshot().phase !== "idle") return;
          if (savedIntent === "completed") { maintenanceEnabled = true; drain.notify(); }
          else await api.start({ allowMetadataExtraction: true, policy });
        } catch (error) {
          if (ownRevision === revision) restorationError = error instanceof Error && /^metadata-build-[a-z-]+$/.test(error.message)
            ? error.message : "metadata-build-restore-failed";
        }
      })().finally(() => { if (deferred) restoration = undefined; }));
    },
    async notifyCatalogChange() {
      if (!maintenanceEnabled) return;
      drain.notify(); await drain.waitForIdle();
    },
    async suspendForDirectory() {
      await loadPreferences();
      revision++; maintenanceEnabled = false; initialSweep = false; drain.reset();
      await controller.pause(); await drain.waitForIdle();
    },
    async releaseDirectory() {
      if (policy && savedIntent === "active") await api.start({ allowMetadataExtraction: true, policy });
      else if (policy && savedIntent === "completed") { maintenanceEnabled = true; drain.notify(); await drain.waitForIdle(); }
      else await protocol.pause();
    },
    async shutdown() {
      revision++; maintenanceEnabled = false; initialSweep = false; drain.reset();
      await controller.pause(); await drain.waitForIdle(); await lifecycle.flush();
    }
  };
  return attachMetadataDirectoryBuilds(api, protocol, options, readCatalog);
};
