import path from "node:path";
import { Worker } from "node:worker_threads";
import type { EmbeddedMetadataExtraction } from "./embeddedMetadataTypes";
import { EMBEDDED_METADATA_EXTRACTOR_VERSION } from "./embeddedMetadataTypes";
import type { EmbeddedMetadataWriteRecord, PendingEmbeddedMetadataCandidate } from "./sqliteImageIndex";

export type EmbeddedMetadataTaskPhase = "idle" | "running" | "cancelling" | "completed" | "cancelled" | "failed";

export interface EmbeddedMetadataTaskStatus {
  phase: EmbeddedMetadataTaskPhase;
  totalCount: number;
  queuedCount: number;
  processedCount: number;
  indexedCount: number;
  emptyCount: number;
  failedCount: number;
  activeDurationMs: number;
}

interface WorkerLike {
  on(event: "message" | "error" | "exit", listener: (...args: any[]) => void): this;
  postMessage(value: unknown): void;
  terminate(): Promise<number>;
}

interface ServiceDependencies {
  listPendingCandidates: (directoryIds?: string[]) => Promise<PendingEmbeddedMetadataCandidate[]>;
  writeBatch: (records: EmbeddedMetadataWriteRecord[], indexedAt: string) => Promise<number>;
  createWorker?: () => WorkerLike;
  batchSize?: number;
  yieldMs?: number;
  foregroundYieldMs?: number;
  workerMaxFiles?: number;
  workerRestartDelayMs?: number;
}

const createInitialStatus = (): EmbeddedMetadataTaskStatus => ({
  phase: "idle",
  totalCount: 0,
  queuedCount: 0,
  processedCount: 0,
  indexedCount: 0,
  emptyCount: 0,
  failedCount: 0,
  activeDurationMs: 0
});

const isInsideDirectory = (filePath: string, directoryPath: string) => {
  const relative = path.relative(path.resolve(directoryPath), path.resolve(filePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

export const createEmbeddedMetadataService = ({
  listPendingCandidates,
  writeBatch,
  createWorker = () => new Worker(path.join(__dirname, "embeddedMetadataWorker.js")),
  batchSize = 24,
  yieldMs = 15,
  foregroundYieldMs = 1000,
  workerMaxFiles = 1,
  workerRestartDelayMs = 0
}: ServiceDependencies) => {
  let status = createInitialStatus();
  let queue: PendingEmbeddedMetadataCandidate[] = [];
  let queuedPaths = new Set<string>();
  let activeCandidate: PendingEmbeddedMetadataCandidate | null = null;
  let activeWorker: WorkerLike | null = null;
  let activeExtractionResolve: ((value: EmbeddedMetadataExtraction) => void) | null = null;
  let cancelled = false;
  let runStartedAt = 0;
  let runPromise: Promise<void> | null = null;
  let filesProcessedByWorker = 0;
  let foregroundActive = false;
  let userInitiated = false;
  const listeners = new Set<(value: EmbeddedMetadataTaskStatus) => void>();

  const snapshot = () => ({
    ...status,
    activeDurationMs: runStartedAt > 0 && ["running", "cancelling"].includes(status.phase)
      ? Date.now() - runStartedAt
      : status.activeDurationMs
  });
  const emit = () => listeners.forEach((listener) => listener(snapshot()));
  const updateQueueCount = () => {
    status.queuedCount = queue.length + (activeCandidate ? 1 : 0);
    emit();
  };
  const appendCandidates = (candidates: PendingEmbeddedMetadataCandidate[]) => {
    let added = 0;
    for (const candidate of candidates) {
      const key = path.normalize(candidate.filePath).toLowerCase();
      if (queuedPaths.has(key)) continue;
      queuedPaths.add(key);
      queue.push(candidate);
      added += 1;
    }
    return added;
  };

  const createFailedExtraction = (candidate: PendingEmbeddedMetadataCandidate, errorCode: string): EmbeddedMetadataExtraction => ({
    sourceRevision: candidate.sourceRevision,
    extractorVersion: EMBEDDED_METADATA_EXTRACTOR_VERSION,
    status: "failed",
    evidence: [],
    capturedAt: null,
    errorCode
  });

  const extractOne = (candidate: PendingEmbeddedMetadataCandidate) => new Promise<EmbeddedMetadataExtraction>((resolve) => {
    activeExtractionResolve = resolve;
    activeWorker?.postMessage({ id: 1, filePath: candidate.filePath });
  });

  const startWorker = () => {
    activeWorker = createWorker();
    filesProcessedByWorker = 0;
    activeWorker.on("message", (message: { extraction?: EmbeddedMetadataExtraction; errorCode?: string }) => {
      const resolve = activeExtractionResolve;
      activeExtractionResolve = null;
      if (resolve && activeCandidate) {
        resolve(message.extraction ?? createFailedExtraction(activeCandidate, message.errorCode ?? "metadata-read-failed"));
      }
    });
    activeWorker.on("error", () => {
      const resolve = activeExtractionResolve;
      activeExtractionResolve = null;
      if (resolve && activeCandidate) resolve(createFailedExtraction(activeCandidate, "metadata-worker-failed"));
    });
    activeWorker.on("exit", () => {
      const resolve = activeExtractionResolve;
      activeExtractionResolve = null;
      if (resolve && activeCandidate) resolve(createFailedExtraction(activeCandidate, "metadata-worker-exited"));
    });
  };

  const run = async () => {
    const pendingWrites: EmbeddedMetadataWriteRecord[] = [];
    const flush = async () => {
      if (pendingWrites.length === 0) return;
      const batch = pendingWrites.splice(0);
      await writeBatch(batch, new Date().toISOString());
    };
    try {
      startWorker();
      while (!cancelled && queue.length > 0) {
        if (filesProcessedByWorker >= workerMaxFiles) {
          await activeWorker?.terminate();
          if (workerRestartDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, workerRestartDelayMs));
          }
          startWorker();
        }
        activeCandidate = queue.shift() ?? null;
        if (!activeCandidate) break;
        const extraction = await extractOne(activeCandidate);
        filesProcessedByWorker += 1;
        const key = path.normalize(activeCandidate.filePath).toLowerCase();
        queuedPaths.delete(key);
        if (cancelled) {
          activeCandidate = null;
          updateQueueCount();
          break;
        }
        pendingWrites.push({ filePath: activeCandidate.filePath, extraction });
        status.processedCount += 1;
        status[extraction.status === "indexed" ? "indexedCount" : extraction.status === "empty" ? "emptyCount" : "failedCount"] += 1;
        activeCandidate = null;
        updateQueueCount();
        if (pendingWrites.length >= batchSize) await flush();
        const delayMs = foregroundActive && !userInitiated ? foregroundYieldMs : yieldMs;
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      await flush();
      status.phase = cancelled ? "cancelled" : "completed";
    } catch {
      status.phase = cancelled ? "cancelled" : "failed";
    } finally {
      await activeWorker?.terminate();
      status.activeDurationMs = Date.now() - runStartedAt;
      runStartedAt = 0;
      activeCandidate = null;
      activeWorker = null;
      if (cancelled) {
        queue = [];
        queuedPaths.clear();
      }
      updateQueueCount();
      runPromise = null;
      userInitiated = false;
    }
  };

  const ensureRunning = () => {
    if (runPromise || queue.length === 0) return;
    cancelled = false;
    runStartedAt = Date.now();
    status.phase = "running";
    runPromise = run();
    emit();
  };

  const enqueue = async (directoryIds?: string[], reset = false) => {
    const candidates = await listPendingCandidates(directoryIds);
    if (!runPromise && (reset || !["idle", "running", "cancelling"].includes(status.phase))) {
      status = createInitialStatus();
      queuedPaths.clear();
      queue = [];
    }
    status.totalCount += appendCandidates(candidates);
    updateQueueCount();
    ensureRunning();
    return snapshot();
  };

  return {
    status: snapshot,
    startBackfill: () => {
      userInitiated = true;
      return enqueue(undefined, true);
    },
    enqueueDirectories: (directoryIds: string[]) => enqueue(directoryIds),
    setForegroundActive: (active: boolean) => { foregroundActive = active; },
    cancel: async () => {
      if (!runPromise) return false;
      cancelled = true;
      status.phase = "cancelling";
      emit();
      await activeWorker?.terminate();
      return true;
    },
    discardDirectory: async (directoryPath: string) => {
      queue = queue.filter((candidate) => {
        if (!isInsideDirectory(candidate.filePath, directoryPath)) return true;
        queuedPaths.delete(path.normalize(candidate.filePath).toLowerCase());
        return false;
      });
      if (activeCandidate && isInsideDirectory(activeCandidate.filePath, directoryPath)) {
        cancelled = true;
        await activeWorker?.terminate();
      }
      updateQueueCount();
    },
    onStatusChanged: (listener: (value: EmbeddedMetadataTaskStatus) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
};
