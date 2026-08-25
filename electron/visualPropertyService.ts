import path from "node:path";
import { Worker } from "node:worker_threads";
import {
  VISUAL_PROPERTY_ANALYZER_VERSION,
  type VisualPropertyAnalysisCandidate,
  type VisualPropertyIndexRecord,
  type VisualPropertyWriteRecord
} from "./visualPropertyTypes";

export type VisualPropertyTaskPhase = "idle" | "waiting" | "running" | "completed" | "failed";

export interface VisualPropertyTaskStatus {
  phase: VisualPropertyTaskPhase;
  queuedCount: number;
  processedCount: number;
  indexedCount: number;
  failedCount: number;
}

interface WorkerLike {
  on(event: "message" | "error" | "exit", listener: (...args: any[]) => void): this;
  postMessage(value: unknown): void;
  terminate(): Promise<number>;
  unref?(): void;
}

interface ServiceDependencies {
  filterPendingCandidates: (candidates: VisualPropertyAnalysisCandidate[]) => Promise<VisualPropertyAnalysisCandidate[]>;
  writeBatch: (records: VisualPropertyWriteRecord[], indexedAt: string) => Promise<number>;
  createWorker?: () => WorkerLike;
  discoveryBatchSize?: number;
  writeBatchSize?: number;
  initialDelayMs?: number;
  yieldMs?: number;
  foregroundYieldMs?: number;
}

const normalizePathKey = (filePath: string) => path.resolve(filePath).toLowerCase();
const isInsideDirectory = (filePath: string, directoryPath: string) => {
  const relative = path.relative(path.resolve(directoryPath), path.resolve(filePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const failedRecord = (candidate: VisualPropertyAnalysisCandidate, errorCode: string): VisualPropertyIndexRecord => ({
  sourceRevision: candidate.sourceRevision,
  analyzerVersion: VISUAL_PROPERTY_ANALYZER_VERSION,
  status: "failed",
  properties: null,
  errorCode
});

export const createVisualPropertyService = ({
  filterPendingCandidates,
  writeBatch,
  createWorker = () => new Worker(path.join(__dirname, "visualPropertyWorker.js")),
  discoveryBatchSize = 256,
  writeBatchSize = 24,
  initialDelayMs = 250,
  yieldMs = 25,
  foregroundYieldMs = 750
}: ServiceDependencies) => {
  let status: VisualPropertyTaskStatus = {
    phase: "idle",
    queuedCount: 0,
    processedCount: 0,
    indexedCount: 0,
    failedCount: 0
  };
  let queue: VisualPropertyAnalysisCandidate[] = [];
  const queuedRevisions = new Map<string, string>();
  const discardedPaths = new Set<string>();
  let activeCandidate: VisualPropertyAnalysisCandidate | null = null;
  let activeWorker: WorkerLike | null = null;
  let activeResolve: ((record: VisualPropertyIndexRecord) => void) | null = null;
  let requestId = 0;
  let activeRequestId = 0;
  let startTimer: NodeJS.Timeout | null = null;
  let runPromise: Promise<void> | null = null;
  let foregroundActive = false;

  const snapshot = (): VisualPropertyTaskStatus => ({
    ...status,
    queuedCount: queue.length + (activeCandidate ? 1 : 0)
  });
  const ensureWorker = () => {
    if (activeWorker) return;
    const worker = createWorker();
    worker.unref?.();
    activeWorker = worker;
    worker.on("message", (message: { id?: number; record?: VisualPropertyIndexRecord }) => {
      if (activeWorker !== worker || message.id !== activeRequestId) return;
      const resolve = activeResolve;
      activeResolve = null;
      if (resolve && message.record) resolve(message.record);
    });
    const handleFailure = (errorCode: string) => {
      if (activeWorker !== worker) return;
      const resolve = activeResolve;
      activeResolve = null;
      activeWorker = null;
      if (resolve && activeCandidate) resolve(failedRecord(activeCandidate, errorCode));
    };
    worker.on("error", () => handleFailure("visual-property-worker-failed"));
    worker.on("exit", (code: number) => {
      if (code !== 0 || activeResolve) handleFailure("visual-property-worker-exited");
      if (activeWorker === worker) activeWorker = null;
    });
  };
  const analyzeOne = (candidate: VisualPropertyAnalysisCandidate) => new Promise<VisualPropertyIndexRecord>((resolve) => {
    ensureWorker();
    activeResolve = resolve;
    activeRequestId = ++requestId;
    activeWorker?.postMessage({
      id: activeRequestId,
      thumbnailPath: candidate.thumbnailPath,
      sourceRevision: candidate.sourceRevision
    });
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
    const pendingWrites: VisualPropertyWriteRecord[] = [];
    let discoveryInProgress: VisualPropertyAnalysisCandidate[] = [];
    const flush = async () => {
      if (pendingWrites.length > 0) await writeBatch(pendingWrites.splice(0), new Date().toISOString());
    };
    status.phase = "running";
    try {
      while (queue.length > 0) {
        const discovery = queue.splice(0, discoveryBatchSize);
        discoveryInProgress = discovery;
        const pending = await filterPendingCandidates(discovery);
        discoveryInProgress = [];
        const pendingPaths = new Set(pending.map((candidate) => normalizePathKey(candidate.filePath)));
        for (const candidate of discovery) {
          const pathKey = normalizePathKey(candidate.filePath);
          if (!pendingPaths.has(pathKey) && queuedRevisions.get(pathKey) === candidate.sourceRevision) {
            queuedRevisions.delete(pathKey);
          }
        }
        for (let candidateIndex = 0; candidateIndex < pending.length; candidateIndex += 1) {
          const candidate = pending[candidateIndex];
          if (queuedRevisions.get(normalizePathKey(candidate.filePath)) !== candidate.sourceRevision) continue;
          activeCandidate = candidate;
          const record = await analyzeOne(candidate);
          const pathKey = normalizePathKey(candidate.filePath);
          if (queuedRevisions.get(pathKey) === candidate.sourceRevision) queuedRevisions.delete(pathKey);
          activeCandidate = null;
          if (!discardedPaths.delete(pathKey)) {
            pendingWrites.push({ filePath: candidate.filePath, record });
            status.processedCount += 1;
            if (record.status === "indexed") status.indexedCount += 1;
            else status.failedCount += 1;
          }
          if (pendingWrites.length >= writeBatchSize) await flush();
          const delayMs = foregroundActive ? foregroundYieldMs : yieldMs;
          if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
      await flush();
      status.phase = "completed";
    } catch {
      for (const candidate of discoveryInProgress) {
        const pathKey = normalizePathKey(candidate.filePath);
        if (queuedRevisions.get(pathKey) === candidate.sourceRevision) queuedRevisions.delete(pathKey);
      }
      status.phase = "failed";
    } finally {
      activeCandidate = null;
      runPromise = null;
      if (queue.length > 0) schedule();
    }
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
    enqueue: (candidate: VisualPropertyAnalysisCandidate) => {
      const pathKey = normalizePathKey(candidate.filePath);
      if (queuedRevisions.get(pathKey) === candidate.sourceRevision) return false;
      queue = queue.filter((queued) => normalizePathKey(queued.filePath) !== pathKey);
      queuedRevisions.set(pathKey, candidate.sourceRevision);
      queue.push(candidate);
      schedule();
      return true;
    },
    discardFiles: (filePaths: string[]) => {
      const pathKeys = new Set(filePaths.map(normalizePathKey));
      discardWhere((filePath) => pathKeys.has(normalizePathKey(filePath)));
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
