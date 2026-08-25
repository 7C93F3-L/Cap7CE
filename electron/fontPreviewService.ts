import fs from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type {
  FontMetadataWorkerRequest,
  FontMetadataWorkerResponse,
  FontPreviewData,
  FontPreviewFallbackReason
} from "./fontPreviewTypes";

export const maximumFontPreviewBytes = 64 * 1024 * 1024;
export const supportedFontPreviewExtensions = new Set([".ttf", ".otf"]);
const fontPreviewTimeoutMs = 10_000;

interface FontPreviewTask {
  sessionId: string;
  worker: Worker;
  settled: boolean;
  cancel?: () => void;
}

interface FontPreviewOpenRequest {
  id: number;
  sessionId: string;
}

export class FontPreviewError extends Error {
  readonly reason: FontPreviewFallbackReason;

  constructor(reason: FontPreviewFallbackReason, message: string) {
    super(message);
    this.name = "FontPreviewError";
    this.reason = reason;
  }
}

let activeTask: FontPreviewTask | null = null;
let latestOpenRequest: FontPreviewOpenRequest | null = null;
let nextOpenRequestId = 0;

const createCancellationError = () => (
  Object.assign(new Error("Font preview session was cancelled."), { code: "ECANCELED" })
);

export const isFontPreviewRequestAuthorized = (
  activePreview: { provider?: string; sessionId: string; filePath: string } | null,
  sessionId: string | null,
  filePath: string
) => {
  if (!activePreview || activePreview.provider !== "font" || !sessionId || activePreview.sessionId !== sessionId) return false;
  const requestedPath = path.normalize(path.resolve(filePath));
  const activePath = path.normalize(path.resolve(activePreview.filePath));
  return process.platform === "win32"
    ? requestedPath.toLowerCase() === activePath.toLowerCase()
    : requestedPath === activePath;
};

const getFontMetadataWorkerPath = () => {
  const compiledPath = path.join(__dirname, "fontMetadataWorker.js");
  return compiledPath.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`
  );
};

const runFontMetadataWorker = (
  sessionId: string,
  sourcePath: string,
  language: FontMetadataWorkerRequest["language"]
) => {
  const request: FontMetadataWorkerRequest = { sourcePath, language };
  const worker = new Worker(getFontMetadataWorkerPath(), { workerData: request });
  const task: FontPreviewTask = { sessionId, worker, settled: false };
  activeTask = task;

  return new Promise<FontPreviewData>((resolve, reject) => {
    const finish = (result: FontPreviewData | Error) => {
      if (task.settled) return;
      task.settled = true;
      clearTimeout(timeout);
      worker.removeAllListeners();
      if (activeTask === task) activeTask = null;
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const timeout = setTimeout(() => {
      void worker.terminate();
      finish(new FontPreviewError("timedOut", "Font metadata parsing timed out."));
    }, fontPreviewTimeoutMs);
    task.cancel = () => {
      void worker.terminate();
      finish(createCancellationError());
    };
    worker.once("error", (error) => finish(error));
    worker.once("message", (response: FontMetadataWorkerResponse) => {
      if (task.settled) return;
      if (!response.ok) {
        finish(new FontPreviewError("invalidFont", response.message));
        return;
      }
      finish(response.data);
    });
    worker.once("exit", (code) => {
      if (!task.settled && code !== 0) {
        finish(new FontPreviewError("failed", `Font metadata worker exited with code ${code}.`));
      }
    });
  });
};

export const closeFontPreviewSession = (sessionId?: string) => {
  const pendingMatches = Boolean(
    latestOpenRequest && (!sessionId || latestOpenRequest.sessionId === sessionId)
  );
  const activeMatches = Boolean(
    activeTask && (!sessionId || activeTask.sessionId === sessionId)
  );
  if (!pendingMatches && !activeMatches) return false;
  if (pendingMatches) latestOpenRequest = null;
  if (activeMatches) {
    const task = activeTask;
    activeTask = null;
    task?.cancel?.();
  }
  return true;
};

export const inspectFontPreviewSource = async (filePath: string) => {
  const normalizedPath = path.normalize(path.resolve(filePath));
  if (!path.isAbsolute(filePath)) throw new FontPreviewError("failed", "Font preview requires an absolute path.");
  if (!supportedFontPreviewExtensions.has(path.extname(normalizedPath).toLowerCase())) {
    throw new FontPreviewError("failed", "Font preview format is unsupported.");
  }
  const stat = await fs.lstat(normalizedPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new FontPreviewError("failed", "Font preview source is unavailable.");
  if (stat.size > maximumFontPreviewBytes) throw new FontPreviewError("tooLarge", "Font preview source exceeds the size limit.");
  return { normalizedPath, size: stat.size };
};

export const openFontPreviewSession = async (
  sessionId: string,
  filePath: string,
  language: FontMetadataWorkerRequest["language"]
) => {
  const request: FontPreviewOpenRequest = { id: ++nextOpenRequestId, sessionId };
  latestOpenRequest = request;
  if (activeTask) {
    const task = activeTask;
    activeTask = null;
    task.cancel?.();
  }
  try {
    const { normalizedPath } = await inspectFontPreviewSource(filePath);
    if (latestOpenRequest !== request) throw createCancellationError();
    return await runFontMetadataWorker(sessionId, normalizedPath, language);
  } finally {
    if (latestOpenRequest === request) latestOpenRequest = null;
  }
};
