import { validMetadataArchiveProperties } from "./metadataArchiveProperties";
import { spawn, type ChildProcess } from "node:child_process";
import { metadataWorkerPaths } from "./metadataWorkerPaths";
import type { MetadataWorkerTask, MetadataWorkerResult, MetadataWorkerResponse } from "./metadataWorkerTypes";
import { searchModelPrecisions } from "../modelSearchFilters";
import { validMetadataTextDataProperties } from "./metadataTextDataProperties";
import { validImageMetadataProperties } from "./imageMetadataMetrics";

interface PendingTask {
  id: number;
  kind: MetadataWorkerTask["kind"];
  resolve: (value: MetadataWorkerResult) => void;
  reject: (reason: Error) => void;
  cleanup: () => void;
}
export interface MetadataWorkerClientOptions {
  workerPath?: string;
  nativeVideoHelperPath?: string;
  timeoutMs?: number;
  recycleResidentBytes?: number;
}

// One content reader per client; no queue, database access, discovery or UI ownership.
export class MetadataWorkerClient {
  private child?: ChildProcess;
  private pending?: PendingTask;
  private sequence = 0;
  private closed = false;
  private readonly retiring = new Set<ChildProcess>();
  constructor(private readonly options: MetadataWorkerClientOptions = {}) {}

  extract(task: MetadataWorkerTask, signal?: AbortSignal): Promise<MetadataWorkerResult> {
    if (this.closed) return Promise.reject(new Error("metadata-worker-closed"));
    if (this.pending || this.retiring.size > 0) return Promise.reject(new Error("metadata-worker-busy"));
    if (signal?.aborted) return Promise.reject(new Error("metadata-worker-cancelled"));
    if (!["image-dimensions", "video", "audio", "font", "model", "document", "three-d", "text-data", "archive"].includes(task.kind) ||
      typeof task.filePath !== "string" || task.filePath.length > 32_768) {
      return Promise.reject(new Error("metadata-worker-invalid-task"));
    }
    const child = this.child ?? this.start();
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const abort = () => this.fail(child, new Error("metadata-worker-cancelled"));
      const timer = setTimeout(() => this.fail(child, new Error("metadata-worker-timeout")), this.options.timeoutMs ?? 14_000);
      this.pending = { id, kind: task.kind, resolve, reject, cleanup: () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      } };
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) return abort();
      child.send({ type: "extract", id, task }, (error) => {
        if (error) this.fail(child, new Error("metadata-worker-send-failed"));
      });
    });
  }

  close(): void {
    this.closed = true;
    if (this.child) this.fail(this.child, new Error("metadata-worker-closed"));
  }

  private start(): ChildProcess {
    const runtime = metadataWorkerPaths();
    const env: NodeJS.ProcessEnv = { ...process.env, CAP7CE_VIDEO_FRAME_HELPER: this.options.nativeVideoHelperPath ?? runtime.videoHelper };
    // Never inherit executable injection or resolve modules through the invoking shell.
    for (const key of Object.keys(env)) if (["NODE_OPTIONS", "NODE_PATH", "ELECTRON_RUN_AS_NODE"].includes(key.toUpperCase())) delete env[key];
    const child = spawn(runtime.executable, ["--max-old-space-size=256", this.options.workerPath ?? runtime.worker], {
      env,
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore", "ipc"]
    });
    this.child = child;
    child.on("error", () => this.fail(child, new Error("metadata-worker-process-failed")));
    child.on("exit", () => this.fail(child, new Error("metadata-worker-exited")));
    child.on("message", (message: unknown) => this.receive(child, message));
    return child;
  }

  private receive(child: ChildProcess, message: unknown): void {
    if (this.child !== child || !this.pending) return;
    const response = message as MetadataWorkerResponse | null;
    const pending = this.pending;
    if (!response || response.id !== pending.id || !this.validResult(response, pending.kind)) {
      return this.fail(child, new Error("metadata-worker-invalid-response"));
    }
    this.pending = undefined;
    pending.cleanup();
    if (response.residentBytes > (this.options.recycleResidentBytes ?? 256 * 1024 * 1024)) this.retire(child);
    pending.resolve(response.result);
  }

  private validResult(response: MetadataWorkerResponse, kind: MetadataWorkerTask["kind"]): boolean {
    if (!Number.isSafeInteger(response.residentBytes) || response.residentBytes < 0 || !response.result) return false;
    const result = response.result;
    if (typeof result !== "object" || Array.isArray(result) || Object.keys(result).some(key =>
      !["state", "width", "height", "durationMilliseconds", "errorCode", "isAnimated", "visualProperties", "channelCount", "fontProperties", "modelProperties", "documentProperties", "threeDProperties", "textDataProperties", "archiveProperties"].includes(key))) return false;
    if (kind !== "image-dimensions" && result.isAnimated !== undefined) return false;
    if (!["image-dimensions", "video"].includes(kind) && result.visualProperties !== undefined) return false;
    if (result.isAnimated !== undefined && result.isAnimated !== null && typeof result.isAnimated !== "boolean") return false;
    if (result.visualProperties !== undefined && result.visualProperties !== null && !validImageMetadataProperties(result.visualProperties)) return false;
    if (result.state === "failed" || result.state === "unsupported") {
      return Object.keys(result).every(key => ["state", "errorCode"].includes(key))
        && typeof result.errorCode === "string" && /^[a-z0-9-]{1,96}$/.test(result.errorCode);
    }
    const positive = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
    if (kind === "archive") return result.state === "indexed"
      && Object.keys(result).every(key => ["state", "archiveProperties"].includes(key))
      && validMetadataArchiveProperties(result.archiveProperties);
    if (result.archiveProperties !== undefined) return false;
    if (kind === "text-data") return result.state === "indexed"
      && Object.keys(result).every(key => ["state", "textDataProperties"].includes(key))
      && validMetadataTextDataProperties(result.textDataProperties);
    if (result.textDataProperties !== undefined) return false;
    if (kind === "three-d") {
      const threeD = result.threeDProperties;
      if (result.state !== "indexed" || result.errorCode !== undefined || result.width !== undefined || result.height !== undefined
        || result.durationMilliseconds !== undefined || result.channelCount !== undefined || result.fontProperties !== undefined
        || result.modelProperties !== undefined || result.documentProperties !== undefined || !threeD || typeof threeD !== "object" || Array.isArray(threeD)
        || Object.keys(threeD).some(key => !["triangleCount", "hasAnimation", "hasRig"].includes(key)) || !Object.keys(threeD).length) return false;
      return (threeD.triangleCount !== undefined || threeD.hasAnimation !== undefined || threeD.hasRig !== undefined)
        && (threeD.triangleCount === undefined || Number.isSafeInteger(threeD.triangleCount) && threeD.triangleCount >= 0)
        && (threeD.hasAnimation === undefined || typeof threeD.hasAnimation === "boolean")
        && (threeD.hasRig === undefined || typeof threeD.hasRig === "boolean");
    }
    if (result.threeDProperties !== undefined) return false;
    if (kind === "document") {
      const document = result.documentProperties;
      if (result.state !== "indexed" || result.errorCode !== undefined || result.width !== undefined || result.height !== undefined
        || result.durationMilliseconds !== undefined || result.channelCount !== undefined || result.fontProperties !== undefined
        || result.modelProperties !== undefined || !document || typeof document !== "object" || Array.isArray(document)
        || Object.keys(document).some(key => !["contentCount", "countKind", "hasEmbeddedImages", "artboardCount"].includes(key))) return false;
      if ((document.contentCount === undefined) !== (document.countKind === undefined)) return false;
      if (document.contentCount !== undefined && (!positive(document.contentCount) || document.contentCount > 100_000
        || !["pages", "slides", "sheets"].includes(String(document.countKind)))) return false;
      if (document.artboardCount !== undefined && (!Number.isSafeInteger(document.artboardCount) || document.artboardCount < 0 || document.artboardCount > 100_000)) return false;
      return (document.contentCount !== undefined || document.artboardCount !== undefined)
        && (document.hasEmbeddedImages === undefined || typeof document.hasEmbeddedImages === "boolean");
    }
    if (result.documentProperties !== undefined) return false;
    if (kind === "model") {
      const model = result.modelProperties;
      return result.state === "indexed" && result.errorCode === undefined && result.width === undefined && result.height === undefined
        && result.durationMilliseconds === undefined && result.channelCount === undefined && result.fontProperties === undefined
        && Boolean(model && typeof model === "object" && !Array.isArray(model) && Object.keys(model).length === 2
          && positive(model.parameterCount) && searchModelPrecisions.some(value => value === model.precision));
    }
    if (result.modelProperties !== undefined) return false;
    if (kind === "font") {
      const font = result.fontProperties;
      return result.state === "indexed" && result.errorCode === undefined && result.width === undefined && result.height === undefined
        && result.durationMilliseconds === undefined && result.channelCount === undefined && Boolean(font && typeof font === "object"
          && !Array.isArray(font) && Object.keys(font).length === 5 && positive(font.weight) && font.weight <= 1000
          && [font.italic, font.supportsLatin, font.supportsChinese, font.variable].every(value => typeof value === "boolean"));
    }
    if (result.fontProperties !== undefined) return false;
    if (kind === "audio") return result.state === "indexed" && result.errorCode === undefined
      && result.width === undefined && result.height === undefined && positive(result.durationMilliseconds)
      && positive(result.channelCount) && Number(result.channelCount) <= 2_147_483_647;
    if (result.channelCount !== undefined) return false;
    return result.state === "indexed" && result.errorCode === undefined && positive(result.width) && positive(result.height)
      && Number(result.width) <= 2_147_483_647 && Number(result.height) <= 2_147_483_647
      && (kind === "image-dimensions" ? result.durationMilliseconds === undefined : positive(result.durationMilliseconds));
  }

  private fail(child: ChildProcess, error: Error): void {
    if (this.child !== child) return;
    const pending = this.pending;
    this.pending = undefined;
    pending?.cleanup();
    this.retire(child);
    pending?.reject(error);
  }

  private retire(child: ChildProcess): void {
    if (this.child === child) this.child = undefined;
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
    this.retiring.add(child);
    // Give the helper time to abort its owned Shell child before hard termination.
    const timer = setTimeout(() => child.kill(), 500);
    timer.unref();
    child.once("exit", () => { clearTimeout(timer); this.retiring.delete(child); });
    if (child.connected) child.send({ type: "stop" }, () => {});
    else child.kill();
  }
}
