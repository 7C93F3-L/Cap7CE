import { parentPort } from "node:worker_threads";
import { inspectAnimationFact } from "./animationFactInspector";
import { ANIMATION_FACT_EXTRACTOR_VERSION, type AnimationFactResult } from "./animationFactTypes";

parentPort?.on("message", async (request: { id: number; filePath: string; sourceRevision: string }) => {
  let result: AnimationFactResult;
  try {
    const animated = await inspectAnimationFact(request.filePath);
    result = animated === null
      ? { sourceRevision: request.sourceRevision, extractorVersion: ANIMATION_FACT_EXTRACTOR_VERSION, status: "failed", isAnimated: false, errorCode: "animation-fact-unsupported" }
      : { sourceRevision: request.sourceRevision, extractorVersion: ANIMATION_FACT_EXTRACTOR_VERSION, status: "indexed", isAnimated: animated, errorCode: "" };
  } catch {
    result = { sourceRevision: request.sourceRevision, extractorVersion: ANIMATION_FACT_EXTRACTOR_VERSION, status: "failed", isAnimated: false, errorCode: "animation-fact-read-failed" };
  }
  parentPort?.postMessage({ id: request.id, result });
});
