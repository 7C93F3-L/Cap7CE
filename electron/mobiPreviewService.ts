import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { MobiPreviewData, MobiPreviewFallbackReason, MobiWorkerResponse } from "./mobiPreviewTypes";

export class MobiPreviewError extends Error {
  constructor(readonly reason: MobiPreviewFallbackReason, message: string) {
    super(message);
  }
}

interface Task {
  sessionId: string;
  worker: Worker;
  resourceRoot: string;
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
const cancelled = () => Object.assign(new Error("MOBI preview session was cancelled."), { code: "ECANCELED" });
const workerPath = () => path.join(__dirname, "mobiPreviewWorker.js").replace(
  `${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`
);

const runWorker = async (sessionId: string, sourcePath: string) => {
  const resourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-mobi-preview-"));
  let worker: Worker;
  try {
    worker = new Worker(workerPath(), { workerData: { sourcePath, resourceRoot } });
  } catch (error) {
    await fs.rm(resourceRoot, { recursive: true, force: true });
    throw error;
  }
  const task: Task = { sessionId, worker, resourceRoot, settled: false };
  activeTask = task;
  return new Promise<MobiPreviewData>((resolve, reject) => {
    const finish = async (value: MobiPreviewData | Error) => {
      if (task.settled) return;
      task.settled = true;
      clearTimeout(timer);
      worker.removeAllListeners();
      void worker.terminate();
      if (activeTask === task) activeTask = null;
      await fs.rm(resourceRoot, { recursive: true, force: true });
      value instanceof Error ? reject(value) : resolve(value);
    };
    const timer = setTimeout(() => {
      void finish(new MobiPreviewError("timedOut", "MOBI preview timed out."));
    }, 10_000);
    task.cancel = () => void finish(cancelled());
    worker.once("error", (error) => void finish(error));
    worker.once("exit", (code) => {
      if (!task.settled) void finish(new Error(`MOBI preview worker exited with code ${code}.`));
    });
    worker.once("message", (response: MobiWorkerResponse) => void (response.ok
      ? finish(response.data)
      : finish(new MobiPreviewError(response.reason, response.message))));
  });
};

export const closeMobiPreviewSession = (sessionId?: string) => {
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

export const openMobiPreviewSession = async (sessionId: string, filePath: string) => {
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
    if (path.extname(normalizedPath).toLowerCase() !== ".mobi" || !stat.isFile() || stat.isSymbolicLink()) {
      throw new MobiPreviewError("invalidMobi", "Invalid MOBI source.");
    }
    if (stat.size > 128 * 1024 * 1024) throw new MobiPreviewError("tooLarge", "MOBI source is too large.");
    return await runWorker(sessionId, normalizedPath);
  } finally {
    if (latestOpenRequest === request) latestOpenRequest = null;
  }
};
