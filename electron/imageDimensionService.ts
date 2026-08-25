import path from "node:path";
import { Worker } from "node:worker_threads";
import {
  IMAGE_DIMENSION_EXTRACTOR_VERSION,
  type ImageDimensionCandidate,
  type ImageDimensionResult,
  type ImageDimensionWriteRecord
} from "./imageDimensionTypes";

interface WorkerLike {
  on(event: "message" | "error" | "exit", listener: (...args: any[]) => void): this;
  postMessage(value: unknown): void;
  terminate(): Promise<number>;
  unref?(): void;
}

interface ImageDimensionServiceDependencies {
  listPendingCandidates: (directoryIds?: string[]) => Promise<ImageDimensionCandidate[]>;
  writeBatch: (records: ImageDimensionWriteRecord[]) => Promise<number>;
  createWorker?: () => WorkerLike;
  writeBatchSize?: number;
  initialDelayMs?: number;
  yieldMs?: number;
  foregroundYieldMs?: number;
}

export interface ImageDimensionTaskStatus {
  phase: "idle" | "waiting" | "running" | "completed" | "failed";
  queuedCount: number;
  processedCount: number;
  indexedCount: number;
  failedCount: number;
}

const normalizePathKey = (filePath: string) => path.resolve(filePath).toLowerCase();
const isInsideDirectory = (filePath: string, directoryPath: string) => {
  const relative = path.relative(path.resolve(directoryPath), path.resolve(filePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const failedResult = (candidate: ImageDimensionCandidate, errorCode: string): ImageDimensionResult => ({
  sourceRevision: candidate.sourceRevision,
  extractorVersion: IMAGE_DIMENSION_EXTRACTOR_VERSION,
  status: "failed",
  width: 0,
  height: 0,
  errorCode
});

export const createImageDimensionService = ({
  listPendingCandidates,
  writeBatch,
  createWorker = () => new Worker(path.join(__dirname, "imageDimensionWorker.js")),
  writeBatchSize = 24,
  initialDelayMs = 250,
  yieldMs = 10,
  foregroundYieldMs = 500
}: ImageDimensionServiceDependencies) => {
  let status: ImageDimensionTaskStatus = {
    phase: "idle",
    queuedCount: 0,
    processedCount: 0,
    indexedCount: 0,
    failedCount: 0
  };
  let queue: ImageDimensionCandidate[] = [];
  const queuedRevisions = new Map<string, string>();
  const discardedPaths = new Set<string>();
  let activeCandidate: ImageDimensionCandidate | null = null;
  let activeWorker: WorkerLike | null = null;
  let activeResolve: ((result: ImageDimensionResult) => void) | null = null;
  let requestId = 0;
  let activeRequestId = 0;
  let startTimer: NodeJS.Timeout | null = null;
  let runPromise: Promise<void> | null = null;
  let foregroundActive = false;

  const snapshot = (): ImageDimensionTaskStatus => ({
    ...status,
    queuedCount: queue.length + (activeCandidate ? 1 : 0)
  });
  const ensureWorker = () => {
    if (activeWorker) return;
    const worker = createWorker();
    worker.unref?.();
    activeWorker = worker;
    worker.on("message", (message: { id?: number; result?: ImageDimensionResult }) => {
      if (activeWorker !== worker || message.id !== activeRequestId) return;
      const resolve = activeResolve;
      activeResolve = null;
      if (resolve && message.result) resolve(message.result);
    });
    const handleFailure = (errorCode: string) => {
      if (activeWorker !== worker) return;
      const resolve = activeResolve;
      activeResolve = null;
      activeWorker = null;
      if (resolve && activeCandidate) resolve(failedResult(activeCandidate, errorCode));
    };
    worker.on("error", () => handleFailure("image-dimension-worker-failed"));
    worker.on("exit", (code: number) => {
      if (code !== 0 || activeResolve) handleFailure("image-dimension-worker-exited");
      if (activeWorker === worker) activeWorker = null;
    });
  };
  const inspectOne = (candidate: ImageDimensionCandidate) => new Promise<ImageDimensionResult>((resolve) => {
    ensureWorker();
    activeResolve = resolve;
    activeRequestId = ++requestId;
    activeWorker?.postMessage({ id: activeRequestId, ...candidate });
  });
  const schedule = () => {
    if (runPromise || startTimer || queue.length === 0) return;
    status.phase = "waiting";
    startTimer = setTimeout(() => {
      startTimer = null;
      runPromise = run();
    }, initialDelayMs);
    startTimer.unref?.();
  };
  const run = async () => {
    const pendingWrites: ImageDimensionWriteRecord[] = [];
    const flush = async () => {
      if (pendingWrites.length > 0) await writeBatch(pendingWrites.splice(0));
    };
    status.phase = "running";
    try {
      while (queue.length > 0) {
        const candidate = queue.shift();
        if (!candidate) break;
        const pathKey = normalizePathKey(candidate.filePath);
        if (queuedRevisions.get(pathKey) !== candidate.sourceRevision) continue;
        activeCandidate = candidate;
        const result = await inspectOne(candidate);
        const stillCurrent = queuedRevisions.get(pathKey) === candidate.sourceRevision;
        if (stillCurrent) queuedRevisions.delete(pathKey);
        activeCandidate = null;
        if (stillCurrent && !discardedPaths.delete(pathKey)) {
          pendingWrites.push({ filePath: candidate.filePath, result });
          status.processedCount += 1;
          status[result.status === "indexed" ? "indexedCount" : "failedCount"] += 1;
        } else {
          discardedPaths.delete(pathKey);
        }
        if (pendingWrites.length >= writeBatchSize) await flush();
        const delayMs = foregroundActive ? foregroundYieldMs : yieldMs;
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      await flush();
      status.phase = "completed";
    } catch {
      status.phase = "failed";
    } finally {
      activeCandidate = null;
      runPromise = null;
      if (queue.length > 0) schedule();
    }
  };
  const appendCandidates = (candidates: ImageDimensionCandidate[]) => {
    let added = 0;
    for (const candidate of candidates) {
      const pathKey = normalizePathKey(candidate.filePath);
      if (queuedRevisions.get(pathKey) === candidate.sourceRevision) continue;
      queue = queue.filter((queued) => normalizePathKey(queued.filePath) !== pathKey);
      queuedRevisions.set(pathKey, candidate.sourceRevision);
      queue.push(candidate);
      added += 1;
    }
    schedule();
    return added;
  };
  const discardWhere = (matches: (filePath: string) => boolean) => {
    queue = queue.filter((candidate) => {
      if (!matches(candidate.filePath)) return true;
      queuedRevisions.delete(normalizePathKey(candidate.filePath));
      return false;
    });
    if (activeCandidate && matches(activeCandidate.filePath)) {
      discardedPaths.add(normalizePathKey(activeCandidate.filePath));
    }
  };

  return {
    status: snapshot,
    enqueueDirectories: async (directoryIds: string[]) => appendCandidates(await listPendingCandidates(directoryIds)),
    discardFiles: (filePaths: string[]) => {
      const keys = new Set(filePaths.map(normalizePathKey));
      discardWhere((filePath) => keys.has(normalizePathKey(filePath)));
    },
    discardDirectory: (directoryPath: string) => discardWhere((filePath) => isInsideDirectory(filePath, directoryPath)),
    setForegroundActive: (active: boolean) => {
      foregroundActive = active;
      schedule();
    },
    shutdown: async () => {
      if (startTimer) clearTimeout(startTimer);
      startTimer = null;
      queue = [];
      queuedRevisions.clear();
      await activeWorker?.terminate();
      activeWorker = null;
    }
  };
};
