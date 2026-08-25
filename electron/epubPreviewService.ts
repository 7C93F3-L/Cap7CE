import fs from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { EpubPreviewData, EpubPreviewFallbackReason, EpubWorkerResponse } from "./epubPreviewTypes";

export class EpubPreviewError extends Error {
  constructor(readonly reason: EpubPreviewFallbackReason, message: string) {
    super(message);
  }
}

interface Task {
  sessionId: string;
  worker: Worker;
  settled: boolean;
  cancel?: () => void;
}

interface OpenRequest {
  id: number;
  sessionId: string;
}

let activeTask: Task | null = null;
let latestOpenRequest: OpenRequest | null = null;
let nextRequestId = 0;
const cancelled = () => Object.assign(new Error("EPUB preview session was cancelled."), { code: "ECANCELED" });
const workerPath = () => path.join(__dirname, "epubPreviewWorker.js").replace(
  `${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`
);

const runWorker = (sessionId: string, sourcePath: string) => {
  const worker = new Worker(workerPath(), { workerData: { sourcePath } });
  const task: Task = { sessionId, worker, settled: false };
  activeTask = task;
  return new Promise<EpubPreviewData>((resolve, reject) => {
    const finish = (value: EpubPreviewData | Error) => {
      if (task.settled) return;
      task.settled = true;
      clearTimeout(timer);
      worker.removeAllListeners();
      if (activeTask === task) activeTask = null;
      value instanceof Error ? reject(value) : resolve(value);
    };
    const timer = setTimeout(() => {
      void worker.terminate();
      finish(new EpubPreviewError("timedOut", "EPUB preview timed out."));
    }, 10_000);
    task.cancel = () => {
      void worker.terminate();
      finish(cancelled());
    };
    worker.once("error", (error) => finish(error));
    worker.once("message", (response: EpubWorkerResponse) => response.ok
      ? finish(response.data)
      : finish(new EpubPreviewError(response.reason, response.message)));
  });
};

export const closeEpubPreviewSession = (sessionId?: string) => {
  const pendingMatches = Boolean(latestOpenRequest && (!sessionId || latestOpenRequest.sessionId === sessionId));
  const activeMatches = Boolean(activeTask && (!sessionId || activeTask.sessionId === sessionId));
  if (!pendingMatches && !activeMatches) return false;
  if (pendingMatches) latestOpenRequest = null;
  if (activeMatches) {
    const task = activeTask;
    activeTask = null;
    task?.cancel?.();
  }
  return true;
};

export const openEpubPreviewSession = async (sessionId: string, filePath: string) => {
  const request: OpenRequest = { id: ++nextRequestId, sessionId };
  latestOpenRequest = request;
  if (activeTask) {
    const task = activeTask;
    activeTask = null;
    task.cancel?.();
  }
  try {
    const normalizedPath = path.resolve(filePath);
    const stat = await fs.lstat(normalizedPath);
    if (latestOpenRequest !== request) throw cancelled();
    if (path.extname(normalizedPath).toLowerCase() !== ".epub" || !stat.isFile() || stat.isSymbolicLink()) {
      throw new EpubPreviewError("invalidEpub", "Invalid EPUB source.");
    }
    if (stat.size > 128 * 1024 * 1024) throw new EpubPreviewError("tooLarge", "EPUB source is too large.");
    return await runWorker(sessionId, normalizedPath);
  } finally {
    if (latestOpenRequest === request) latestOpenRequest = null;
  }
};
