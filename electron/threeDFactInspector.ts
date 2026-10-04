import path from "node:path";
import { Worker } from "node:worker_threads";
import { THREE_D_FACT_EXTRACTOR_VERSION, type ThreeDFactCandidate, type ThreeDFactResult } from "./threeDFactTypes";

const failed = (candidate: ThreeDFactCandidate, errorCode: string): ThreeDFactResult => ({
  sourceRevision: candidate.sourceRevision,
  extractorVersion: THREE_D_FACT_EXTRACTOR_VERSION,
  status: "failed",
  triangleCountKnown: false,
  triangleCount: 0,
  animationKnown: false,
  hasAnimation: false,
  rigKnown: false,
  hasRig: false,
  errorCode
});

const inspectOne = (candidate: ThreeDFactCandidate, timeoutMs: number) => new Promise<ThreeDFactResult>((resolve) => {
  const worker = new Worker(path.join(__dirname, "threeDFactWorker.js"));
  let settled = false;
  const finish = (result: ThreeDFactResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    void worker.terminate();
    resolve(result);
  };
  const timer = setTimeout(() => finish(failed(candidate, "three-d-fact-timeout")), timeoutMs);
  timer.unref?.();
  worker.on("message", (message: { id?: number; result?: ThreeDFactResult }) => {
    if (message.id === 0 && message.result) finish(message.result);
  });
  worker.on("error", () => finish(failed(candidate, "three-d-fact-worker-failed")));
  worker.on("exit", (code) => { if (code !== 0) finish(failed(candidate, "three-d-fact-worker-exited")); });
  worker.postMessage({ id: 0, candidate });
});

export const inspectThreeDFactBatch = async (candidates: ThreeDFactCandidate[], timeoutMs = 30_000) => {
  const results: ThreeDFactResult[] = [];
  for (const candidate of candidates) results.push(await inspectOne(candidate, timeoutMs));
  return results;
};
