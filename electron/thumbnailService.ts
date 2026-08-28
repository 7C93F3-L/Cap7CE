import fs from "node:fs/promises";
import path from "node:path";
import {
  clearThumbnailVisualCaches,
  clearVisualCaches,
  deleteVisualCachesForDirectory,
  deleteVisualCachesForImages,
  getVisualCacheDirectory,
  getVisualCacheStats,
  initializeVisualCacheDirectories
} from "./visualCacheService";
import {
  pauseSearchShellVisualCacheForClear,
  resumeSearchShellVisualCacheAfterClear
} from "./searchShellVisualCacheService";
import { createFileSourceRevision } from "./fileSourceRevision";
import { cachedThumbnailFailureCode } from "./thumbnailFailurePolicy";
import { ensureSearchThumbnail } from "./visualRenderService";

let thumbnailCacheFileInventory: Set<string> | null = null;
let thumbnailCacheFileInventoryPromise: Promise<Set<string>> | null = null;
let thumbnailCacheFileInventoryRevision = 0;
type ThumbnailRequestPriority = "interactive" | "background";
interface ThumbnailRenderTask {
  filePath: string;
  pathKey: string;
  sourceRevision: string;
  priority: ThumbnailRequestPriority;
  backgroundRequested: boolean;
  resolve: (thumbnailPath: string) => void;
  reject: (error: Error) => void;
}
const thumbnailRenderQueue: ThumbnailRenderTask[] = [];
const pendingThumbnailRenders = new Map<string, { task: ThumbnailRenderTask; promise: Promise<string> }>();
const activeThumbnailRenders = new Set<Promise<void>>();
const failedInteractiveThumbnailRevisions = new Map<string, string>();
const thumbnailRenderPauseReasons = new Set<string>();
let activeThumbnailRenderCount = 0;
let interactiveTasksSinceBackground = 0;
const maximumConcurrentThumbnailRenders = 2;
const maximumInteractiveTasksBeforeBackground = 4;
const maximumFailedInteractiveThumbnailRevisions = 50_000;

export type ThumbnailLifecycleEvent =
  | { kind: "available"; filePath: string; thumbnailPath: string; sourceRevision: string }
  | { kind: "discard-files"; filePaths: string[] }
  | { kind: "discard-directory"; directoryPath: string };
const thumbnailLifecycleListeners = new Set<(event: ThumbnailLifecycleEvent) => void>();

const emitThumbnailLifecycle = (event: ThumbnailLifecycleEvent) => {
  queueMicrotask(() => {
    for (const listener of thumbnailLifecycleListeners) {
      try { listener(event); } catch { /* Background observers cannot fail thumbnail delivery. */ }
    }
  });
};

export const onThumbnailLifecycle = (listener: (event: ThumbnailLifecycleEvent) => void) => {
  thumbnailLifecycleListeners.add(listener);
  return () => thumbnailLifecycleListeners.delete(listener);
};

export const announceCachedThumbnail = (
  filePath: string,
  thumbnailPath: string,
  fileSize: number,
  modifiedMs: number
) => emitThumbnailLifecycle({
  kind: "available",
  filePath,
  thumbnailPath,
  sourceRevision: createFileSourceRevision({ fileSize, modifiedAt: new Date(modifiedMs).toISOString() })
});

const normalizeThumbnailPathKey = (filePath: string) => {
  const resolvedPath = path.resolve(filePath);
  return process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
};

const rememberInteractiveThumbnailFailure = (pathKey: string, sourceRevision: string) => {
  if (!sourceRevision) return;
  failedInteractiveThumbnailRevisions.delete(pathKey);
  failedInteractiveThumbnailRevisions.set(pathKey, sourceRevision);
  if (failedInteractiveThumbnailRevisions.size <= maximumFailedInteractiveThumbnailRevisions) return;
  const oldestPathKey = failedInteractiveThumbnailRevisions.keys().next().value;
  if (oldestPathKey) failedInteractiveThumbnailRevisions.delete(oldestPathKey);
};

const clearFailedInteractiveThumbnailForFiles = (filePaths: string[]) => {
  for (const filePath of filePaths) failedInteractiveThumbnailRevisions.delete(normalizeThumbnailPathKey(filePath));
};

const clearFailedInteractiveThumbnailsForDirectory = (directoryPath: string) => {
  const directoryPathKey = normalizeThumbnailPathKey(directoryPath);
  for (const pathKey of failedInteractiveThumbnailRevisions.keys()) {
    if (pathKey === directoryPathKey || pathKey.startsWith(`${directoryPathKey}${path.sep}`)) {
      failedInteractiveThumbnailRevisions.delete(pathKey);
    }
  }
};

const enqueueInteractiveThumbnailTask = (task: ThumbnailRenderTask) => {
  const firstBackgroundIndex = thumbnailRenderQueue.findIndex((candidate) => candidate.priority === "background");
  if (firstBackgroundIndex < 0) thumbnailRenderQueue.push(task);
  else thumbnailRenderQueue.splice(firstBackgroundIndex, 0, task);
};

const pumpThumbnailRenderQueue = () => {
  if (thumbnailRenderPauseReasons.size > 0) return;
  while (activeThumbnailRenderCount < maximumConcurrentThumbnailRenders && thumbnailRenderQueue.length > 0) {
    const backgroundIndex = thumbnailRenderQueue.findIndex((candidate) => candidate.priority === "background");
    const taskIndex = backgroundIndex >= 0 && interactiveTasksSinceBackground >= maximumInteractiveTasksBeforeBackground
      ? backgroundIndex
      : 0;
    const [task] = thumbnailRenderQueue.splice(taskIndex, 1);
    if (!task) return;
    if (task.priority === "background") interactiveTasksSinceBackground = 0;
    else interactiveTasksSinceBackground += 1;
    activeThumbnailRenderCount += 1;
    const render = ensureSearchThumbnail(task.filePath)
      .then(({ thumbnailPath, fileSize, modifiedMs }) => {
        failedInteractiveThumbnailRevisions.delete(task.pathKey);
        addThumbnailPathToInventory(thumbnailPath);
        task.resolve(thumbnailPath);
        emitThumbnailLifecycle({
          kind: "available",
          filePath: task.filePath,
          thumbnailPath,
          sourceRevision: createFileSourceRevision({
            fileSize,
            modifiedAt: new Date(modifiedMs).toISOString()
          })
        });
      }, (error) => {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        if ((normalizedError as NodeJS.ErrnoException).code !== "ECANCELED") {
          rememberInteractiveThumbnailFailure(task.pathKey, task.sourceRevision);
        }
        task.reject(normalizedError);
      })
      .finally(() => {
        activeThumbnailRenderCount -= 1;
        activeThumbnailRenders.delete(render);
        pendingThumbnailRenders.delete(task.pathKey);
        pumpThumbnailRenderQueue();
      });
    activeThumbnailRenders.add(render);
  }
};

export const getThumbnailCacheDirectory = () => getVisualCacheDirectory("search-thumbnail");

export const initializeThumbnailCache = () => initializeVisualCacheDirectories();

const addThumbnailPathToInventory = (thumbnailPath: string) => {
  thumbnailCacheFileInventory?.add(path.basename(thumbnailPath));
  thumbnailCacheFileInventory?.add(path.basename(`${thumbnailPath}.json`));
};

const invalidateThumbnailCacheFileInventory = () => {
  thumbnailCacheFileInventoryRevision += 1;
  thumbnailCacheFileInventory = null;
  thumbnailCacheFileInventoryPromise = null;
};

export const getThumbnailCacheFileInventory = async () => {
  if (thumbnailCacheFileInventory) {
    return thumbnailCacheFileInventory;
  }
  if (thumbnailCacheFileInventoryPromise) {
    return thumbnailCacheFileInventoryPromise;
  }

  const inventoryRevision = thumbnailCacheFileInventoryRevision;
  const inventoryPromise = (async () => {
    await initializeThumbnailCache();
    const entries = await fs.readdir(getThumbnailCacheDirectory(), { withFileTypes: true });
    const inventory = new Set(
      entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
    );
    if (inventoryRevision === thumbnailCacheFileInventoryRevision) {
      thumbnailCacheFileInventory = inventory;
    }
    return inventory;
  })();
  thumbnailCacheFileInventoryPromise = inventoryPromise;

  return inventoryPromise.finally(() => {
    if (thumbnailCacheFileInventoryPromise === inventoryPromise) {
      thumbnailCacheFileInventoryPromise = null;
    }
  });
};

export const ensureThumbnailPath = (
  filePath: string,
  priority: ThumbnailRequestPriority = "interactive",
  sourceRevision = ""
) => {
  const pathKey = normalizeThumbnailPathKey(filePath);
  if (priority === "interactive" && sourceRevision) {
    const failedRevision = failedInteractiveThumbnailRevisions.get(pathKey);
    if (failedRevision === sourceRevision) {
      return Promise.reject(Object.assign(new Error("Thumbnail unavailable for unchanged file."), {
        code: cachedThumbnailFailureCode
      }));
    }
    if (failedRevision) failedInteractiveThumbnailRevisions.delete(pathKey);
  }
  const pending = pendingThumbnailRenders.get(pathKey);
  if (pending) {
    if (sourceRevision && !pending.task.sourceRevision) pending.task.sourceRevision = sourceRevision;
    if (priority === "background") {
      pending.task.backgroundRequested = true;
    }
    if (priority === "interactive" && pending.task.priority === "background") {
      pending.task.priority = "interactive";
      const queueIndex = thumbnailRenderQueue.indexOf(pending.task);
      if (queueIndex >= 0) {
        thumbnailRenderQueue.splice(queueIndex, 1);
        enqueueInteractiveThumbnailTask(pending.task);
      }
    }
    return pending.promise;
  }

  let resolveTask!: (thumbnailPath: string) => void;
  let rejectTask!: (error: Error) => void;
  const promise = new Promise<string>((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = reject;
  });
  const task: ThumbnailRenderTask = {
    filePath,
    pathKey,
    sourceRevision,
    priority,
    backgroundRequested: priority === "background",
    resolve: resolveTask,
    reject: rejectTask
  };
  pendingThumbnailRenders.set(pathKey, { task, promise });
  if (priority === "interactive") enqueueInteractiveThumbnailTask(task);
  else thumbnailRenderQueue.push(task);
  pumpThumbnailRenderQueue();
  return promise;
};

export const discardQueuedInteractiveThumbnailRenders = () => {
  let discardedCount = 0;
  for (let index = thumbnailRenderQueue.length - 1; index >= 0; index -= 1) {
    const task = thumbnailRenderQueue[index];
    if (task.priority !== "interactive") continue;
    thumbnailRenderQueue.splice(index, 1);
    if (task.backgroundRequested) {
      task.priority = "background";
      thumbnailRenderQueue.push(task);
      continue;
    }
    pendingThumbnailRenders.delete(task.pathKey);
    task.reject(Object.assign(new Error("Thumbnail request is no longer visible."), { code: "ECANCELED" }));
    discardedCount += 1;
  }
  pumpThumbnailRenderQueue();
  return discardedCount;
};

const discardQueuedThumbnailRenders = (matches: (task: ThumbnailRenderTask) => boolean) => {
  let discardedCount = 0;
  for (let index = thumbnailRenderQueue.length - 1; index >= 0; index -= 1) {
    const task = thumbnailRenderQueue[index];
    if (!matches(task)) continue;
    thumbnailRenderQueue.splice(index, 1);
    pendingThumbnailRenders.delete(task.pathKey);
    task.reject(Object.assign(new Error("Thumbnail request was cancelled."), { code: "ECANCELED" }));
    discardedCount += 1;
  }
  return discardedCount;
};

export const pauseThumbnailRendering = async (reason: string) => {
  thumbnailRenderPauseReasons.add(reason);
  if (activeThumbnailRenders.size > 0) {
    await Promise.allSettled([...activeThumbnailRenders]);
  }
};

export const resumeThumbnailRendering = (reason: string) => {
  thumbnailRenderPauseReasons.delete(reason);
  pumpThumbnailRenderQueue();
};

export const discardAllQueuedThumbnailRenders = () => discardQueuedThumbnailRenders(() => true);

export const discardQueuedThumbnailRendersForDirectory = (directoryPath: string) => {
  const directoryPathKey = normalizeThumbnailPathKey(directoryPath);
  return discardQueuedThumbnailRenders((task) => (
    task.pathKey === directoryPathKey || task.pathKey.startsWith(`${directoryPathKey}${path.sep}`)
  ));
};

export const deleteThumbnailsForImages = async (filePaths: string[]) => {
  await deleteVisualCachesForImages(filePaths);
  clearFailedInteractiveThumbnailForFiles(filePaths);
  invalidateThumbnailCacheFileInventory();
  emitThumbnailLifecycle({ kind: "discard-files", filePaths });
};

export const deleteThumbnailsForDirectory = async (directoryPath: string, knownFilePaths: string[] = []) => {
  await deleteVisualCachesForDirectory(directoryPath);
  await deleteVisualCachesForImages(knownFilePaths);
  clearFailedInteractiveThumbnailsForDirectory(directoryPath);
  clearFailedInteractiveThumbnailForFiles(knownFilePaths);
  invalidateThumbnailCacheFileInventory();
  emitThumbnailLifecycle({ kind: "discard-directory", directoryPath });
};

export const clearAllVisualCaches = async () => {
  await pauseSearchShellVisualCacheForClear();
  try {
    const stats = await clearVisualCaches();
    failedInteractiveThumbnailRevisions.clear();
    invalidateThumbnailCacheFileInventory();
    return stats;
  } finally {
    resumeSearchShellVisualCacheAfterClear();
  }
};

export const clearThumbnailCaches = async () => {
  await pauseSearchShellVisualCacheForClear();
  try {
    const stats = await clearThumbnailVisualCaches();
    failedInteractiveThumbnailRevisions.clear();
    invalidateThumbnailCacheFileInventory();
    return stats;
  } finally {
    resumeSearchShellVisualCacheAfterClear();
  }
};

export const getAllVisualCacheStats = () => getVisualCacheStats();
