import fs from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { MODEL_FACT_EXTRACTOR_VERSION, type ModelFactCandidate, type ModelFactResult } from "./modelFactTypes";

interface ModelFactWorkerResponse {
  ok: boolean;
  data?: { parameterCount: number; precision: ModelFactResult["precision"] };
  errorCode?: string;
}

const failed = (candidate: ModelFactCandidate, errorCode: string): ModelFactResult => ({
  sourceRevision: candidate.sourceRevision,
  extractorVersion: MODEL_FACT_EXTRACTOR_VERSION,
  status: "failed",
  parameterCount: 0,
  precision: "",
  errorCode
});
const getWorkerPath = () => path.join(__dirname, "modelFactWorker.js").replace(
  `${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`
);

const inspectOne = async (candidate: ModelFactCandidate, timeoutMs: number, signal?: AbortSignal): Promise<ModelFactResult> => {
  if (signal?.aborted) return failed(candidate, "model-fact-cancelled");
  try {
    const stat = await fs.lstat(candidate.filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) return failed(candidate, "model-fact-source-unavailable");
  } catch { return failed(candidate, "model-fact-source-unavailable"); }
  if (signal?.aborted) return failed(candidate, "model-fact-cancelled");
  return new Promise((resolve) => {
    const worker = new Worker(getWorkerPath(), { workerData: { sourcePath: candidate.filePath },
      ...(signal ? { resourceLimits: { maxOldGenerationSizeMb: 256 } } : {}) });
    let settled = false;
    const finish = (result: ModelFactResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.removeAllListeners();
      const retired = worker.threadId > 0 ? worker.terminate().catch(() => undefined) : Promise.resolve();
      void retired.then(() => resolve(result));
    };
    const abort = () => finish(failed(candidate, "model-fact-cancelled"));
    const timer = setTimeout(() => finish(failed(candidate, "model-fact-timeout")), timeoutMs);
    timer.unref?.();
    worker.once("error", () => finish(failed(candidate, "model-fact-worker-failed")));
    worker.once("message", (response: ModelFactWorkerResponse) => {
      if (!response.ok || !response.data) return finish(failed(candidate, response.errorCode || "model-fact-invalid-model"));
      finish({
        sourceRevision: candidate.sourceRevision,
        extractorVersion: MODEL_FACT_EXTRACTOR_VERSION,
        status: "indexed",
        parameterCount: response.data.parameterCount,
        precision: response.data.precision,
        errorCode: ""
      });
    });
    worker.once("exit", () => { if (!settled) finish(failed(candidate, "model-fact-worker-failed")); });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
};
export const inspectModelFactBatch = async (candidates: ModelFactCandidate[], timeoutMs = 30_000, signal?: AbortSignal) => {
  const results: ModelFactResult[] = [];
  for (const candidate of candidates) results.push(await inspectOne(candidate, timeoutMs, signal));
  return results;
};
