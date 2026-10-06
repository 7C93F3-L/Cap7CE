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

const inspectOne = async (candidate: FontFactCandidate, timeoutMs: number, signal?: AbortSignal): Promise<FontFactResult> => {
  if (signal?.aborted) return failed(candidate, "font-fact-cancelled");
  try {
    const stat = await fs.lstat(candidate.filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumFontBytes) return failed(candidate, "font-fact-source-unavailable");
  } catch { return failed(candidate, "font-fact-source-unavailable"); }
  if (signal?.aborted) return failed(candidate, "font-fact-cancelled");
  return new Promise((resolve) => {
    const request: FontMetadataWorkerRequest = { sourcePath: candidate.filePath, language: "en-US" };
    const worker = new Worker(getWorkerPath(), { workerData: request,
      ...(signal ? { resourceLimits: { maxOldGenerationSizeMb: 128 } } : {}) });
    let settled = false;
    const finish = (result: FontFactResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.removeAllListeners();
      const retired = worker.threadId > 0 ? worker.terminate().catch(() => undefined) : Promise.resolve();
      void retired.then(() => resolve(result));
    };
    const abort = () => finish(failed(candidate, "font-fact-cancelled"));
    const timer = setTimeout(() => finish(failed(candidate, "font-fact-timeout")), timeoutMs);
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
    worker.once("exit", () => { if (!settled) finish(failed(candidate, "font-fact-worker-failed")); });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
};

export const inspectFontFactBatch = async (candidates: FontFactCandidate[], timeoutMs = 10_000, signal?: AbortSignal) => {
  const results: FontFactResult[] = [];
  for (const candidate of candidates) results.push(await inspectOne(candidate, timeoutMs, signal));
  return results;
};
