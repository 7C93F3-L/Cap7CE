import path from "node:path";
import { createVisualCacheEntryFromSourceMetadata } from "./visualCacheService";
import { ensureThumbnailPath, getThumbnailCacheFileInventory } from "./thumbnailService";

export type ThumbnailOptimizationSortField = "file_name" | "modified_at";
export type ThumbnailOptimizationSortDirection = "asc" | "desc";

export interface ThumbnailOptimizationCandidate {
  filePath: string;
  fileName: string;
  fileSize: number;
  modifiedAt: string;
  modifiedMs: number;
}

type QueuedThumbnailOptimizationCandidate = ThumbnailOptimizationCandidate & {
  cacheKey: string;
};

export interface ThumbnailOptimizationStatus {
  enabled: boolean;
  phase: "disabled" | "ready" | "running" | "completed";
  queuedCount: number;
  processedCount: number;
  failedCount: number;
  activeDurationMs: number;
}

type StatusListener = (status: ThumbnailOptimizationStatus) => void;

const queueByPath = new Map<string, QueuedThumbnailOptimizationCandidate>();
const failedCacheKeys = new Set<string>();
const pauseReasons = new Set<string>();
let queue: QueuedThumbnailOptimizationCandidate[] = [];
let activePathKey: string | null = null;
let enabled = false;
let completed = false;
let processedCount = 0;
let failedCount = 0;
let activeDurationMs = 0;
let sortField: ThumbnailOptimizationSortField = "file_name";
let sortDirection: ThumbnailOptimizationSortDirection = "desc";
let workerPromise: Promise<void> | null = null;
let statusListener: StatusListener | null = null;
let foregroundActive = false;

const foregroundYieldMs = 750;
const backgroundYieldMs = 120;
const foregroundPauseReason = "foreground-window";

const normalizePathKey = (filePath: string) => path.resolve(filePath).toLowerCase();
const isPathInsideDirectory = (filePath: string, directoryPath: string) => {
  const filePathKey = normalizePathKey(filePath);
  const directoryPathKey = normalizePathKey(directoryPath);
  return filePathKey === directoryPathKey || filePathKey.startsWith(`${directoryPathKey}${path.sep}`);
};
const yieldToForegroundWork = () => new Promise<void>((resolve) => (
  setTimeout(resolve, foregroundActive ? foregroundYieldMs : backgroundYieldMs)
));

const compareCandidates = (left: ThumbnailOptimizationCandidate, right: ThumbnailOptimizationCandidate) => {
  const direction = sortDirection === "desc" ? -1 : 1;
  const comparison = sortField === "modified_at"
    ? new Date(left.modifiedAt).getTime() - new Date(right.modifiedAt).getTime()
    : left.fileName.localeCompare(right.fileName, undefined, { numeric: true, sensitivity: "base" });
  if (comparison !== 0) {
    return comparison * direction;
  }
  return left.filePath.localeCompare(right.filePath, undefined, { numeric: true, sensitivity: "base" }) * direction;
};

const sortQueue = () => {
  queue.sort(compareCandidates);
};

export const getThumbnailOptimizationStatus = (): ThumbnailOptimizationStatus => ({
  enabled,
  phase: !enabled
    ? "disabled"
    : activePathKey !== null || queue.length > 0
      ? "running"
      : completed
        ? "completed"
        : "ready",
  queuedCount: queue.length + (activePathKey === null ? 0 : 1),
  processedCount,
  failedCount,
  activeDurationMs
});

const emitStatus = () => {
  statusListener?.(getThumbnailOptimizationStatus());
};

const runWorker = async () => {
  const activeRunStartedAt = Date.now();
  try {
    while (enabled && pauseReasons.size === 0) {
      const candidate = queue.shift();
      if (!candidate) {
        completed = processedCount > 0;
        break;
      }

      const candidateKey = normalizePathKey(candidate.filePath);
      queueByPath.delete(candidateKey);
      activePathKey = candidateKey;
      emitStatus();

      try {
        await ensureThumbnailPath(candidate.filePath, "background");
        failedCacheKeys.delete(candidate.cacheKey);
      } catch (error) {
        failedCacheKeys.add(candidate.cacheKey);
        failedCount += 1;
        console.warn("[thumbnail-optimization] failed", {
          filePath: candidate.filePath,
          message: error instanceof Error ? error.message : String(error)
        });
      } finally {
        processedCount += 1;
        activePathKey = null;
        emitStatus();
      }

      await yieldToForegroundWork();
    }
  } finally {
    activeDurationMs += Date.now() - activeRunStartedAt;
  }
};

const startWorker = () => {
  if (!enabled || pauseReasons.size > 0 || queue.length === 0 || workerPromise) {
    emitStatus();
    return;
  }

  workerPromise = runWorker().finally(() => {
    workerPromise = null;
    emitStatus();
    if (enabled && pauseReasons.size === 0 && queue.length > 0) {
      startWorker();
    }
  });
};

export const setThumbnailOptimizationStatusListener = (listener: StatusListener | null) => {
  statusListener = listener;
  emitStatus();
};

export const setThumbnailOptimizationSort = (
  nextSortField: ThumbnailOptimizationSortField,
  nextSortDirection: ThumbnailOptimizationSortDirection
) => {
  sortField = nextSortField;
  sortDirection = nextSortDirection;
  sortQueue();
  emitStatus();
};

export const setThumbnailOptimizationForegroundActive = (active: boolean) => {
  if (foregroundActive === active) return;
  foregroundActive = active;
  if (foregroundActive) {
    pauseReasons.add(foregroundPauseReason);
    emitStatus();
    return;
  }

  pauseReasons.delete(foregroundPauseReason);
  emitStatus();
  startWorker();
};

export const enqueueThumbnailOptimizationCandidates = async (candidates: ThumbnailOptimizationCandidate[]) => {
  if (!enabled || candidates.length === 0) {
    return;
  }

  const cacheFileInventory = await getThumbnailCacheFileInventory();
  if (!enabled) {
    return;
  }

  let addedCandidate = false;
  for (const candidate of candidates) {
    const candidateKey = normalizePathKey(candidate.filePath);
    if (candidateKey === activePathKey || queueByPath.has(candidateKey)) {
      continue;
    }

    const cacheEntry = createVisualCacheEntryFromSourceMetadata(candidate.filePath, "search-thumbnail", {
      fileSize: candidate.fileSize,
      modifiedMs: candidate.modifiedMs
    });
    if (failedCacheKeys.has(cacheEntry.key)) {
      continue;
    }
    if (
      cacheFileInventory.has(path.basename(cacheEntry.imagePath))
      && cacheFileInventory.has(path.basename(cacheEntry.metadataPath))
    ) {
      continue;
    }

    const queuedCandidate = { ...candidate, cacheKey: cacheEntry.key };
    queueByPath.set(candidateKey, queuedCandidate);
    queue.push(queuedCandidate);
    addedCandidate = true;
  }

  if (addedCandidate) {
    completed = false;
    sortQueue();
    emitStatus();
    startWorker();
  } else if (activePathKey === null && queue.length === 0 && !completed) {
    completed = true;
    emitStatus();
  }
};

export const setThumbnailOptimizationEnabled = async (nextEnabled: boolean) => {
  enabled = nextEnabled;
  completed = false;
  processedCount = 0;
  failedCount = 0;
  activeDurationMs = 0;
  failedCacheKeys.clear();

  if (!enabled) {
    queue = [];
    queueByPath.clear();
  }

  emitStatus();
  if (workerPromise) {
    await workerPromise;
  }
  if (enabled) {
    startWorker();
  }
};

export const pauseThumbnailOptimization = async (reason: string) => {
  pauseReasons.add(reason);
  emitStatus();
  if (workerPromise) {
    await workerPromise;
  }
};

export const resumeThumbnailOptimization = (reason: string) => {
  pauseReasons.delete(reason);
  emitStatus();
  startWorker();
};

export const discardThumbnailOptimizationCandidatesForDirectory = (directoryPath: string) => {
  const retainedQueue = queue.filter((candidate) => !isPathInsideDirectory(candidate.filePath, directoryPath));
  if (retainedQueue.length === queue.length) {
    return;
  }

  queue = retainedQueue;
  queueByPath.clear();
  queue.forEach((candidate) => queueByPath.set(normalizePathKey(candidate.filePath), candidate));
  emitStatus();
};
