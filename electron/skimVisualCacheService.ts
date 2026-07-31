import {
  clearSkimVisualCaches,
  getSkimVisualCacheStats,
  type VisualCacheStats
} from "./visualCacheService";
import { ensureSkimPreviewPath, ensureSkimThumbnailPath } from "./visualRenderService";

export type SkimVisualRequestKind = "thumbnail" | "preview";

interface SkimVisualSession {
  cancelled: boolean;
}

interface SkimVisualTask {
  sessionId: string;
  sourcePath: string;
  kind: SkimVisualRequestKind;
  resolve: (cachePath: string) => void;
  reject: (error: Error) => void;
}

const sessions = new Map<string, SkimVisualSession>();
const queuedTasks: SkimVisualTask[] = [];
const activeTasks = new Set<Promise<void>>();
const maximumConcurrentTasks = 2;
let clearing = false;

const cancelledError = () => Object.assign(new Error("Skim visual task cancelled."), { code: "ECANCELED" });

const isSessionActive = (sessionId: string) => !clearing && sessions.get(sessionId)?.cancelled === false;

const pumpQueue = () => {
  if (clearing) return;
  while (activeTasks.size < maximumConcurrentTasks && queuedTasks.length > 0) {
    const task = queuedTasks.shift();
    if (!task) return;
    if (!isSessionActive(task.sessionId)) {
      task.reject(cancelledError());
      continue;
    }

    const activeTask = (async () => {
      try {
        const cachePath = task.kind === "preview"
          ? await ensureSkimPreviewPath(task.sourcePath)
          : await ensureSkimThumbnailPath(task.sourcePath);
        if (!isSessionActive(task.sessionId)) throw cancelledError();
        task.resolve(cachePath);
      } catch (error) {
        task.reject(error instanceof Error ? error : new Error(String(error)));
      }
    })().finally(() => {
      activeTasks.delete(activeTask);
      pumpQueue();
    });
    activeTasks.add(activeTask);
  }
};

export const beginSkimVisualSession = (sessionId: string) => {
  if (!sessionId) return false;
  sessions.set(sessionId, { cancelled: false });
  return true;
};

export const cancelSkimVisualSession = (sessionId: string) => {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.cancelled = true;
  sessions.delete(sessionId);
  for (let index = queuedTasks.length - 1; index >= 0; index -= 1) {
    const task = queuedTasks[index];
    if (task.sessionId === sessionId) {
      queuedTasks.splice(index, 1);
      task.reject(cancelledError());
    }
  }
  return true;
};

export const requestSkimVisualCache = (
  sessionId: string,
  sourcePath: string,
  kind: SkimVisualRequestKind
) => new Promise<string>((resolve, reject) => {
  if (!isSessionActive(sessionId)) {
    reject(cancelledError());
    return;
  }
  const task = { sessionId, sourcePath, kind, resolve, reject };
  if (kind === "preview") queuedTasks.unshift(task);
  else queuedTasks.push(task);
  pumpQueue();
});

export const getSkimCacheStats = (): Promise<VisualCacheStats> => getSkimVisualCacheStats();

export const clearSkimCacheSafely = async (): Promise<VisualCacheStats> => {
  clearing = true;
  for (const sessionId of [...sessions.keys()]) cancelSkimVisualSession(sessionId);
  await Promise.allSettled([...activeTasks]);
  try {
    return await clearSkimVisualCaches();
  } finally {
    clearing = false;
  }
};
