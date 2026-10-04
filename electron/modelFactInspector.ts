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

const inspectOne = async (candidate: ModelFactCandidate, timeoutMs: number): Promise<ModelFactResult> => {
  try {
    const stat = await fs.lstat(candidate.filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) return failed(candidate, "model-fact-source-unavailable");
  } catch { return failed(candidate, "model-fact-source-unavailable"); }
  return new Promise((resolve) => {
    const worker = new Worker(getWorkerPath(), { workerData: { sourcePath: candidate.filePath } });
    let settled = false;
    const finish = (result: ModelFactResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeAllListeners();
      if (worker.threadId > 0) void worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => { void worker.terminate(); finish(failed(candidate, "model-fact-timeout")); }, timeoutMs);
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
    worker.once("exit", (code) => { if (!settled && code !== 0) finish(failed(candidate, "model-fact-worker-failed")); });
  });
};
export const inspectModelFactBatch = async (candidates: ModelFactCandidate[], timeoutMs = 30_000) => {
  const results: ModelFactResult[] = [];
  for (const candidate of candidates) results.push(await inspectOne(candidate, timeoutMs));
  return results;
};
