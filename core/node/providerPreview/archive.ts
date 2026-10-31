import fs from "node:fs/promises";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { spawnPreviewWorker } from "./lifecycle";
import type {
  ArchivePreviewFallbackReason,
  ArchiveWorkerResponse
} from "../../../src/shared/archivePreviewTypes";

const supportedArchiveExtensions = new Set([".zip", ".7z", ".rar"]);
const maximumArchiveBytes = 8 * 1024 * 1024 * 1024;
const maximumArchiveOutputBytes = 4 * 1024 * 1024;
const archivePreviewTimeoutMs = 10_000;

interface ArchivePreviewTask {
  sessionId: string;
  requestId: number;
  worker: ChildProcess;
  settled: boolean;
  cancel?: () => void;
}

export class ArchivePreviewError extends Error {
  readonly reason: ArchivePreviewFallbackReason;

  constructor(reason: ArchivePreviewFallbackReason, message: string) {
    super(message);
    this.name = "ArchivePreviewError";
    this.reason = reason;
  }
}

let activeTask: ArchivePreviewTask | null = null;
let archivePreviewRequestId = 0;

const getArchiveWorkerPath = () => {
  const compiledPath = path.join(__dirname, "archivePreviewWorker.js");
  return compiledPath.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`
  );
};

import { parseArchiveListOutput } from "../fileFacts/domain/archivePreviewList";
const classifyArchiveFailure = (output: string): ArchivePreviewFallbackReason => {
  const normalized = output.toLowerCase();
  if (normalized.includes("wrong password") || normalized.includes("encrypted archive")) {
    return "passwordRequired";
  }
  if (normalized.includes("is not archive") || normalized.includes("cannot open the file as")) {
    return "invalidArchive";
  }
  if (normalized.includes("unsupported") || normalized.includes("not implemented")) {
    return "unsupportedArchive";
  }
  return "failed";
};

const runArchiveWorker = (sessionId: string, sourcePath: string) => {
  const requestId = ++archivePreviewRequestId;
  const worker = spawnPreviewWorker(process.execPath, [getArchiveWorkerPath()], {
    env: {
      ...process.env,
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      CAP7CE_ARCHIVE_SOURCE: Buffer.from(sourcePath, "utf8").toString("base64"),
      CAP7CE_ARCHIVE_OUTPUT_LIMIT: String(maximumArchiveOutputBytes)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  const task: ArchivePreviewTask = { sessionId, requestId, worker, settled: false };
  activeTask = task;

  return new Promise<ArchiveWorkerResponse>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const finish = (result: ArchiveWorkerResponse | Error) => {
      if (task.settled) return;
      task.settled = true;
      clearTimeout(timeout);
      worker.stdout?.removeAllListeners();
      worker.stderr?.removeAllListeners();
      if (activeTask === task) activeTask = null;
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const timeout = setTimeout(() => {
      worker.kill();
      finish(new ArchivePreviewError("timedOut", "Archive preview timed out."));
    }, archivePreviewTimeoutMs);
    task.cancel = () => {
      worker.kill();
      finish(Object.assign(new Error("Archive preview session was cancelled."), { code: "ECANCELED" }));
    };

    worker.stdout?.setEncoding("utf8");
    worker.stderr?.setEncoding("utf8");
    worker.stdout?.on("data", (chunk: string) => {
      stdout = (stdout + chunk).slice(0, maximumArchiveOutputBytes * 2);
    });
    worker.stderr?.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-4_096);
    });
    worker.once("error", (error) => finish(error));
    worker.once("close", (code) => {
      if (task.settled) return;
      if (code !== 0) {
        const reason = classifyArchiveFailure(stderr);
        finish(new ArchivePreviewError(reason, stderr.trim() || `Archive preview worker exited with code ${code}.`));
        return;
      }
      try {
        finish(JSON.parse(stdout) as ArchiveWorkerResponse);
      } catch {
        finish(new Error("Archive preview worker returned an invalid response."));
      }
    });
  });
};

export const closeArchivePreviewSession = (sessionId?: string) => {
  if (!activeTask || (sessionId && activeTask.sessionId !== sessionId)) return false;
  archivePreviewRequestId += 1;
  const task = activeTask;
  activeTask = null;
  task.cancel?.();
  return true;
};

export const openArchivePreviewSession = async (sessionId: string, filePath: string) => {
  closeArchivePreviewSession();
  const normalizedPath = path.normalize(path.resolve(filePath));
  if (!path.isAbsolute(filePath)) throw new ArchivePreviewError("failed", "Archive preview requires an absolute path.");
  if (!supportedArchiveExtensions.has(path.extname(normalizedPath).toLowerCase())) {
    throw new ArchivePreviewError("unsupportedArchive", "Archive preview format is unsupported.");
  }

  const stat = await fs.lstat(normalizedPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new ArchivePreviewError("failed", "Archive preview source is unavailable.");
  }
  if (stat.size > maximumArchiveBytes) {
    throw new ArchivePreviewError("tooLarge", `Archive preview file exceeds ${maximumArchiveBytes} bytes.`);
  }

  const response = await runArchiveWorker(sessionId, normalizedPath);
  if (response.exitCode !== 0) {
    const reason = classifyArchiveFailure(response.output);
    throw new ArchivePreviewError(reason, `Archive preview failed with code ${response.exitCode}.`);
  }
  if (/^Encrypted = \+$/m.test(response.output)) {
    throw new ArchivePreviewError("passwordRequired", "Archive preview requires a password.");
  }

  const preview = parseArchiveListOutput(response.output, response.outputTruncated);
  if (preview.entryCount === 0 && !/^Files = 0$/m.test(response.output)) {
    throw new ArchivePreviewError("invalidArchive", "Archive preview returned no readable entries.");
  }
  return preview;
};
