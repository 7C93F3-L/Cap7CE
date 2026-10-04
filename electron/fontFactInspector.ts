import fs from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { FontMetadataWorkerRequest, FontMetadataWorkerResponse } from "./fontPreviewTypes";
import { FONT_FACT_EXTRACTOR_VERSION, type FontFactCandidate, type FontFactResult } from "./fontFactTypes";

const maximumFontBytes = 64 * 1024 * 1024;
const failed = (candidate: FontFactCandidate, errorCode: string): FontFactResult => ({
  sourceRevision: candidate.sourceRevision, extractorVersion: FONT_FACT_EXTRACTOR_VERSION, status: "failed",
  weight: 400, italic: false, supportsLatin: false, supportsChinese: false, variable: false, errorCode
});
const getWorkerPath = () => path.join(__dirname, "fontMetadataWorker.js").replace(
  `${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`
);

const inspectOne = async (candidate: FontFactCandidate, timeoutMs: number): Promise<FontFactResult> => {
  try {
    const stat = await fs.lstat(candidate.filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumFontBytes) return failed(candidate, "font-fact-source-unavailable");
  } catch { return failed(candidate, "font-fact-source-unavailable"); }
  return new Promise((resolve) => {
    const request: FontMetadataWorkerRequest = { sourcePath: candidate.filePath, language: "en-US" };
    const worker = new Worker(getWorkerPath(), { workerData: request });
    let settled = false;
    const finish = (result: FontFactResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeAllListeners();
      if (worker.threadId > 0) void worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => { void worker.terminate(); finish(failed(candidate, "font-fact-timeout")); }, timeoutMs);
    timer.unref?.();
    worker.once("error", () => finish(failed(candidate, "font-fact-worker-failed")));
    worker.once("message", (response: FontMetadataWorkerResponse) => {
      if (!response.ok) return finish(failed(candidate, "font-fact-invalid-font"));
      finish({
        sourceRevision: candidate.sourceRevision,
        extractorVersion: FONT_FACT_EXTRACTOR_VERSION,
        status: "indexed",
        weight: response.data.weight,
        italic: /italic|oblique/i.test(response.data.styleName),
        supportsLatin: response.data.supportsLatinSample,
        supportsChinese: response.data.supportsChineseSample,
        variable: response.data.variationAxes.length > 0,
        errorCode: ""
      });
    });
    worker.once("exit", (code) => { if (!settled && code !== 0) finish(failed(candidate, "font-fact-worker-failed")); });
  });
};

export const inspectFontFactBatch = async (candidates: FontFactCandidate[], timeoutMs = 10_000) => {
  const results: FontFactResult[] = [];
  for (const candidate of candidates) results.push(await inspectOne(candidate, timeoutMs));
  return results;
};
