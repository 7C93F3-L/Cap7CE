import path from "node:path";
import createSevenZip from "7z-wasm";
import type { ArchiveWorkerRequest, ArchiveWorkerResponse } from "./archivePreviewTypes";

const outputLines: string[] = [];
let outputTruncated = false;
let maximumOutputBytes = 4 * 1024 * 1024;
let outputByteCount = 0;
let exitCode = 0;
const appendText = (value: string) => {
  if (outputTruncated) return;
  const lineBytes = Buffer.byteLength(value, "utf8") + 1;
  if (outputByteCount + lineBytes > maximumOutputBytes) {
    outputTruncated = true;
    throw Object.assign(new Error("Archive listing output exceeded the limit."), { code: "EOUTPUTLIMIT" });
  }
  outputLines.push(value);
  outputByteCount += lineBytes;
  process.stderr.write(`${value}\n`);
};

const sevenZipPromise = createSevenZip({
  stdin: () => -1,
  print: appendText,
  printErr: appendText,
  quit: (code, status) => {
    exitCode = code;
    throw status;
  }
});

const run = async (request: ArchiveWorkerRequest) => {
  maximumOutputBytes = request.maximumOutputBytes;
  const sevenZip = await sevenZipPromise;

  const sourceDirectory = path.dirname(request.sourcePath);
  const sourceName = path.basename(request.sourcePath);
  sevenZip.FS.mkdir("/source");
  sevenZip.FS.mount(sevenZip.NODEFS, { root: sourceDirectory }, "/source");
  sevenZip.FS.chdir("/source");

  try {
    sevenZip.callMain([
      "l",
      "-slt",
      "-sccUTF-8",
      "-p__CAP7CE_LIST_ONLY_NO_PASSWORD__",
      "--",
      sourceName
    ]);
  } catch (error) {
    const status = error as { status?: unknown; code?: unknown };
    if (status.code !== "EOUTPUTLIMIT" && typeof status.status === "number") {
      exitCode = status.status;
    } else if (status.code !== "EOUTPUTLIMIT" && exitCode === 0) {
      throw error;
    }
  }

  const response: ArchiveWorkerResponse = {
    exitCode,
    output: outputLines.join("\n"),
    outputTruncated
  };
  process.stdout.write(JSON.stringify(response));
};

const encodedSourcePath = process.env.CAP7CE_ARCHIVE_SOURCE ?? "";
const configuredOutputLimit = Number(process.env.CAP7CE_ARCHIVE_OUTPUT_LIMIT);
const request: ArchiveWorkerRequest = {
  sourcePath: Buffer.from(encodedSourcePath, "base64").toString("utf8"),
  maximumOutputBytes: Number.isSafeInteger(configuredOutputLimit) && configuredOutputLimit > 0
    ? configuredOutputLimit
    : maximumOutputBytes
};
void run(request).catch((error) => {
  throw error;
});
