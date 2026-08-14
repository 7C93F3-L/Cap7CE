import path from "node:path";

interface ShellThumbnailSession {
  failedPaths: Set<string>;
  circuitOpen: boolean;
}

interface ShellThumbnailTask {
  sessionId: string;
  sourcePath: string;
  pathKey: string;
  kind: ShellThumbnailRequestKind;
  resolve: (cachePath: string) => void;
  reject: (error: Error) => void;
}

export type ShellThumbnailRequestKind = "thumbnail" | "preview";

const normalizePathKey = (sourcePath: string) => {
  const resolvedPath = path.resolve(sourcePath);
  return process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
};

const schedulerError = (message: string, code: string) => Object.assign(new Error(message), { code });
const cancelledError = () => schedulerError("Skim Shell thumbnail task cancelled.", "ECANCELED");
const unavailableError = () => schedulerError("Skim Shell thumbnail is unavailable for this session.", "ESHELLUNAVAILABLE");

export class ShellThumbnailScheduler {
  private readonly sessions = new Map<string, ShellThumbnailSession>();
  private readonly queuedTasks: ShellThumbnailTask[] = [];
  private readonly pendingRequests = new Map<string, Promise<string>>();
  private activeTask: Promise<void> | null = null;
  private active = false;
  private clearing = false;

  constructor(private readonly ensureThumbnailPath: (
    sourcePath: string,
    kind: ShellThumbnailRequestKind
  ) => Promise<string>) {}

  beginSession(sessionId: string) {
    if (!sessionId) return false;
    this.cancelSession(sessionId);
    this.sessions.set(sessionId, { failedPaths: new Set(), circuitOpen: false });
    return true;
  }

  cancelSession(sessionId: string) {
    const existed = this.sessions.delete(sessionId);
    for (let index = this.queuedTasks.length - 1; index >= 0; index -= 1) {
      const task = this.queuedTasks[index];
      if (task.sessionId === sessionId) {
        this.queuedTasks.splice(index, 1);
        task.reject(cancelledError());
      }
    }
    return existed;
  }

  setActive(active: boolean) {
    this.active = active;
    if (active) this.pumpQueue();
  }

  request(sessionId: string, sourcePath: string, kind: ShellThumbnailRequestKind = "thumbnail") {
    const session = this.sessions.get(sessionId);
    const pathKey = `${kind}:${normalizePathKey(sourcePath)}`;
    if (this.clearing || !session) return Promise.reject(cancelledError());
    if (session.circuitOpen || session.failedPaths.has(pathKey)) {
      return Promise.reject(unavailableError());
    }

    const requestKey = `${sessionId}:${pathKey}`;
    const pending = this.pendingRequests.get(requestKey);
    if (pending) return pending;

    const request = new Promise<string>((resolve, reject) => {
      const task = { sessionId, sourcePath, pathKey, kind, resolve, reject };
      if (kind === "preview") this.queuedTasks.unshift(task);
      else this.queuedTasks.push(task);
      this.pumpQueue();
    });
    this.pendingRequests.set(requestKey, request);
    void request.then(
      () => this.pendingRequests.delete(requestKey),
      () => this.pendingRequests.delete(requestKey)
    );
    return request;
  }

  async clear() {
    this.clearing = true;
    for (const sessionId of [...this.sessions.keys()]) this.cancelSession(sessionId);
    if (this.activeTask) await Promise.allSettled([this.activeTask]);
    this.clearing = false;
  }

  private isSessionActive(sessionId: string) {
    return !this.clearing && this.sessions.has(sessionId);
  }

  private pumpQueue() {
    if (this.clearing || this.activeTask) return;

    let task: ShellThumbnailTask | undefined;
    while (!task) {
      const taskIndex = this.active
        ? 0
        : this.queuedTasks.findIndex((candidate) => candidate.kind === "preview");
      if (taskIndex < 0 || taskIndex >= this.queuedTasks.length) return;
      const candidate = this.queuedTasks.splice(taskIndex, 1)[0];
      if (!candidate) return;
      if (!this.isSessionActive(candidate.sessionId)) {
        candidate.reject(cancelledError());
        continue;
      }
      task = candidate;
    }

    const currentTask = task;
    this.activeTask = (async () => {
      try {
        const cachePath = await this.ensureThumbnailPath(currentTask.sourcePath, currentTask.kind);
        if (!this.isSessionActive(currentTask.sessionId)) throw cancelledError();
        currentTask.resolve(cachePath);
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        const session = this.sessions.get(currentTask.sessionId);
        if (session) {
          session.failedPaths.add(currentTask.pathKey);
          if ((normalizedError as NodeJS.ErrnoException).code === "ETIMEDOUT") {
            session.circuitOpen = true;
          }
        }
        currentTask.reject(normalizedError);
      }
    })().finally(() => {
      this.activeTask = null;
      this.pumpQueue();
    });
  }
}
