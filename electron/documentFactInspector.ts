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
  artboardCountKnown: false,
  artboardCount: 0,
  errorCode
});

const inspectOne = (candidate: DocumentFactCandidate, timeoutMs: number, signal?: AbortSignal) => new Promise<DocumentFactResult>((resolve) => {
  if (signal?.aborted) return resolve(failed(candidate, "document-fact-cancelled"));
  const worker = new Worker(path.join(__dirname, "documentFactWorker.js"),
    signal ? { resourceLimits: { maxOldGenerationSizeMb: 256 } } : {});
  if (!signal) worker.unref();
  let settled = false;
  const finish = (result: DocumentFactResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    worker.removeAllListeners();
    const retired = worker.threadId > 0 ? worker.terminate().catch(() => undefined) : Promise.resolve();
    void retired.then(() => resolve(result));
  };
  const abort = () => finish(failed(candidate, "document-fact-cancelled"));
  const timer = setTimeout(() => finish(failed(candidate, "document-content-count-timeout")), timeoutMs);
  timer.unref?.();
  worker.on("message", (message: { id?: number; result?: DocumentFactResult }) => {
    if (message.id === 1 && message.result) finish(message.result);
  });
  worker.on("error", () => finish(failed(candidate, "document-content-count-worker-failed")));
  worker.on("exit", () => { if (!settled) finish(failed(candidate, "document-content-count-worker-exited")); });
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) return abort();
  try { worker.postMessage({ id: 1, candidate }); }
  catch { finish(failed(candidate, "document-content-count-worker-failed")); }
});

export const inspectDocumentFactBatch = async (candidates: DocumentFactCandidate[], timeoutMs = 30_000, signal?: AbortSignal) => {
  const results: DocumentFactResult[] = [];
  for (const candidate of candidates) results.push(await inspectOne(candidate, timeoutMs, signal));
  return results;
};
