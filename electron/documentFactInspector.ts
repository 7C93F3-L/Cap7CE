import path from "node:path";
import { Worker } from "node:worker_threads";
import { DOCUMENT_FACT_EXTRACTOR_VERSION, type DocumentFactCandidate, type DocumentFactResult } from "./documentFactTypes";

const failed = (candidate: DocumentFactCandidate, errorCode: string): DocumentFactResult => ({
  sourceRevision: candidate.sourceRevision,
  extractorVersion: DOCUMENT_FACT_EXTRACTOR_VERSION,
  status: "failed",
  contentCount: 0,
  countKind: "pages",
  imageCompositionKnown: false,
  hasEmbeddedImages: false,
  errorCode
});

const inspectOne = (candidate: DocumentFactCandidate, timeoutMs: number) => new Promise<DocumentFactResult>((resolve) => {
  const worker = new Worker(path.join(__dirname, "documentFactWorker.js"));
  worker.unref();
  let settled = false;
  const finish = (result: DocumentFactResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    void worker.terminate();
    resolve(result);
  };
  const timer = setTimeout(() => finish(failed(candidate, "document-content-count-timeout")), timeoutMs);
  timer.unref?.();
  worker.on("message", (message: { id?: number; result?: DocumentFactResult }) => {
    if (message.id === 1 && message.result) finish(message.result);
  });
  worker.on("error", () => finish(failed(candidate, "document-content-count-worker-failed")));
  worker.on("exit", (code) => { if (code !== 0) finish(failed(candidate, "document-content-count-worker-exited")); });
  worker.postMessage({ id: 1, candidate });
});

export const inspectDocumentFactBatch = async (candidates: DocumentFactCandidate[], timeoutMs = 30_000) => {
  const results: DocumentFactResult[] = [];
  for (const candidate of candidates) results.push(await inspectOne(candidate, timeoutMs));
  return results;
};
