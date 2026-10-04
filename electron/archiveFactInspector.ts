import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { deriveArchiveFact } from "./archiveFactExtractor";
import { parseArchiveListOutput } from "./archivePreviewService";
import type { ArchiveWorkerResponse } from "./archivePreviewTypes";
import { ARCHIVE_FACT_EXTRACTOR_VERSION, type ArchiveFactCandidate, type ArchiveFactResult } from "./archiveFactTypes";

const maximumArchiveBytes = 8 * 1024 * 1024 * 1024;
const maximumArchiveOutputBytes = 4 * 1024 * 1024;

const failed = (candidate: ArchiveFactCandidate, errorCode: string): ArchiveFactResult => ({
  sourceRevision: candidate.sourceRevision,
  extractorVersion: ARCHIVE_FACT_EXTRACTOR_VERSION,
  status: "failed",
  listingComplete: false,
  fileCountKnown: false,
  fileCount: 0,
  structureKnown: false,
  hasDirectories: false,
  contentTypes: [],
  errorCode
});

const getArchiveWorkerPath = () => path.join(__dirname, "archivePreviewWorker.js").replace(
  `${path.sep}app.asar${path.sep}`,
  `${path.sep}app.asar.unpacked${path.sep}`
);

const inspectOne = async (candidate: ArchiveFactCandidate, timeoutMs: number): Promise<ArchiveFactResult> => {
  try {
    const stat = await fs.lstat(candidate.filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumArchiveBytes) return failed(candidate, "archive-fact-source-unavailable");
  } catch {
    return failed(candidate, "archive-fact-source-unavailable");
  }
  return new Promise((resolve) => {
    const worker = spawn(process.execPath, [getArchiveWorkerPath()], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        CAP7CE_ARCHIVE_SOURCE: Buffer.from(candidate.filePath, "utf8").toString("base64"),
        CAP7CE_ARCHIVE_OUTPUT_LIMIT: String(maximumArchiveOutputBytes)
      },
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });
    let settled = false;
    let stdout = "";
    const finish = (result: ArchiveFactResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeAllListeners();
      worker.stdout?.removeAllListeners();
      if (!worker.killed) worker.kill();
      resolve(result);
    };
    const timer = setTimeout(() => finish(failed(candidate, "archive-fact-timeout")), timeoutMs);
    timer.unref?.();
    worker.stdout?.setEncoding("utf8");
    worker.stdout?.on("data", (chunk: string) => { stdout = (stdout + chunk).slice(0, maximumArchiveOutputBytes * 2); });
    worker.once("error", () => finish(failed(candidate, "archive-fact-worker-failed")));
    worker.once("close", (code) => {
      if (settled) return;
      if (code !== 0) return finish(failed(candidate, "archive-fact-list-failed"));
      try {
        const response = JSON.parse(stdout) as ArchiveWorkerResponse;
        if (response.exitCode !== 0 || /^Encrypted = \+$/m.test(response.output)) return finish(failed(candidate, "archive-fact-list-unavailable"));
        const preview = parseArchiveListOutput(response.output, response.outputTruncated, Number.MAX_SAFE_INTEGER);
        if (preview.entryCount === 0 && !/^Files = 0$/m.test(response.output)) return finish(failed(candidate, "archive-fact-invalid-list"));
        finish({
          sourceRevision: candidate.sourceRevision,
          extractorVersion: ARCHIVE_FACT_EXTRACTOR_VERSION,
          status: "indexed",
          ...deriveArchiveFact(preview),
          errorCode: ""
        });
      } catch {
        finish(failed(candidate, "archive-fact-invalid-worker-response"));
      }
    });
  });
};

export const inspectArchiveFactBatch = async (candidates: ArchiveFactCandidate[], timeoutMs = 12_000) => {
  const results: ArchiveFactResult[] = [];
  for (const candidate of candidates) results.push(await inspectOne(candidate, timeoutMs));
  return results;
};
