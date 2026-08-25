import { parentPort } from "node:worker_threads";
import {
  IMAGE_DIMENSION_EXTRACTOR_VERSION,
  type ImageDimensionResult
} from "./imageDimensionTypes";
import { readVisualSourceDimensions } from "./visualSourceDimensions";

interface ImageDimensionWorkerRequest {
  id: number;
  filePath: string;
  sourceRevision: string;
}

const failedResult = (sourceRevision: string, errorCode: string): ImageDimensionResult => ({
  sourceRevision,
  extractorVersion: IMAGE_DIMENSION_EXTRACTOR_VERSION,
  status: "failed",
  width: 0,
  height: 0,
  errorCode
});

parentPort?.on("message", async (request: ImageDimensionWorkerRequest) => {
  let result: ImageDimensionResult;
  try {
    const dimensions = await readVisualSourceDimensions(request.filePath);
    result = dimensions ? {
      sourceRevision: request.sourceRevision,
      extractorVersion: IMAGE_DIMENSION_EXTRACTOR_VERSION,
      status: "indexed",
      width: dimensions.width,
      height: dimensions.height,
      errorCode: ""
    } : failedResult(request.sourceRevision, "image-dimensions-unsupported");
  } catch {
    result = failedResult(request.sourceRevision, "image-dimensions-read-failed");
  }
  parentPort?.postMessage({ id: request.id, result });
});
