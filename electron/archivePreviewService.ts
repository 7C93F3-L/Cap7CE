import fs from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type {
  ArchivePreviewData,
  ArchivePreviewEntry,
  ArchivePreviewFallbackReason,
  ArchiveWorkerResponse
} from "./archivePreviewTypes";

const supportedArchiveExtensions = new Set([".zip", ".7z", ".rar"]);
const maximumArchiveBytes = 8 * 1024 * 1024 * 1024;
const maximumArchiveEntries = 2_000;
const maximumArchiveOutputBytes = 4 * 1024 * 1024;
const maximumArchivePathLength = 4_096;
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

const parseByteCount = (value: string | undefined) => {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

const parseFields = (block: string) => {
  const fields = new Map<string, string>();
  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(" = ");
    if (separator <= 0) continue;
    fields.set(line.slice(0, separator), line.slice(separator + 3));
  }
  return fields;
};

export const parseArchiveListOutput = (
  output: string,
  outputTruncated = false
): ArchivePreviewData => {
  const parsedEntries: ArchivePreviewEntry[] = [];
  let totalUncompressedSize = 0;
  let discoveredEntries = 0;

  for (const block of output.split(/\r?\n\r?\n/)) {
    const fields = parseFields(block);
    const entryPath = fields.get("Path");
    const size = parseByteCount(fields.get("Size"));
    if (entryPath === undefined || size === null) continue;
    if (!entryPath || entryPath.length > maximumArchivePathLength || /[\u0000-\u001f]/.test(entryPath)) continue;

    discoveredEntries += 1;
    totalUncompressedSize += size;
    if (parsedEntries.length >= maximumArchiveEntries) continue;
    parsedEntries.push({
      path: entryPath,
      size,
      compressedSize: parseByteCount(fields.get("Packed Size")),
      directory: fields.get("Folder") === "+" || fields.get("Attributes")?.includes("D") === true
    });
  }

  return {
    entries: parsedEntries,
    entryCount: discoveredEntries,
    totalUncompressedSize,
    truncated: outputTruncated || discoveredEntries > parsedEntries.length
  };
};

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
  const worker = spawn(process.execPath, [getArchiveWorkerPath()], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
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
      worker.removeAllListeners();
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
