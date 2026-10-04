import path from "node:path";
import { Worker } from "node:worker_threads";
import { TEXT_DATA_FACT_EXTRACTOR_VERSION, type TextDataFactCandidate, type TextDataFactKind, type TextDataFactResult } from "./textDataFactTypes";

const getFactKind = (filePath: string): TextDataFactKind => {
  const extension = path.extname(filePath).toLowerCase();
  return extension === ".csv" ? "csv" : extension === ".json" ? "json" : "text";
};
const failed = (candidate: TextDataFactCandidate, errorCode: string): TextDataFactResult => ({
  sourceRevision: candidate.sourceRevision,
  extractorVersion: TEXT_DATA_FACT_EXTRACTOR_VERSION,
  status: "failed",
  factKind: getFactKind(candidate.filePath),
  characterCount: 0,
  lineCount: 0,
  recordCount: 0,
  columnCount: 0,
  jsonRootKind: "none",
  errorCode
});

const inspectOne = (candidate: TextDataFactCandidate, timeoutMs: number) => new Promise<TextDataFactResult>((resolve) => {
  const worker = new Worker(path.join(__dirname, "textDataFactWorker.js"));
  worker.unref();
  let settled = false;
  const finish = (result: TextDataFactResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    void worker.terminate();
    resolve(result);
  };
  const timer = setTimeout(() => finish(failed(candidate, "text-data-timeout")), timeoutMs);
  timer.unref?.();
  worker.on("message", (message: { id?: number; result?: TextDataFactResult }) => {
    if (message.id === 1 && message.result) finish(message.result);
  });
  worker.on("error", () => finish(failed(candidate, "text-data-worker-failed")));
  worker.on("exit", (code) => { if (code !== 0) finish(failed(candidate, "text-data-worker-exited")); });
  worker.postMessage({ id: 1, candidate });
});

export const inspectTextDataFactBatch = async (candidates: TextDataFactCandidate[], timeoutMs = 30_000) => {
  const results: TextDataFactResult[] = [];
  for (const candidate of candidates) results.push(await inspectOne(candidate, timeoutMs));
  return results;
};
