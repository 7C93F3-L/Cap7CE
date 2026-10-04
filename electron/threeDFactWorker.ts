import { parentPort } from "node:worker_threads";
import { readThreeDFact } from "./threeDFactExtractor";
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

parentPort?.on("message", async (request: { id: number; candidate: ThreeDFactCandidate }) => {
  try {
    const fact = await readThreeDFact(request.candidate.filePath);
    parentPort?.postMessage({ id: request.id, result: {
      sourceRevision: request.candidate.sourceRevision,
      extractorVersion: THREE_D_FACT_EXTRACTOR_VERSION,
      status: "indexed",
      ...fact,
      errorCode: ""
    } satisfies ThreeDFactResult });
  } catch (error) {
    parentPort?.postMessage({
      id: request.id,
      result: failed(request.candidate, error instanceof Error ? error.message.slice(0, 120) : "three-d-fact-unavailable")
    });
  }
});
