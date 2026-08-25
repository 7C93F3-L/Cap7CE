import { parentPort } from "node:worker_threads";
import sharp from "sharp";
import { analyzeVisualProperties } from "./visualPropertyAnalyzer";
import { VISUAL_PROPERTY_ANALYZER_VERSION, type VisualPropertyIndexRecord } from "./visualPropertyTypes";

interface VisualPropertyWorkerRequest {
  id: number;
  thumbnailPath: string;
  sourceRevision: string;
}

const failedRecord = (sourceRevision: string, errorCode: string): VisualPropertyIndexRecord => ({
  sourceRevision,
  analyzerVersion: VISUAL_PROPERTY_ANALYZER_VERSION,
  status: "failed",
  properties: null,
  errorCode
});

sharp.concurrency(1);

parentPort?.on("message", async (request: VisualPropertyWorkerRequest) => {
  try {
    const { data, info } = await sharp(request.thumbnailPath, { failOn: "error" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    parentPort?.postMessage({
      id: request.id,
      record: {
        sourceRevision: request.sourceRevision,
        analyzerVersion: VISUAL_PROPERTY_ANALYZER_VERSION,
        status: "indexed",
        properties: analyzeVisualProperties({ data, width: info.width, height: info.height }),
        errorCode: ""
      } satisfies VisualPropertyIndexRecord
    });
  } catch {
    parentPort?.postMessage({ id: request.id, record: failedRecord(request.sourceRevision, "thumbnail-analysis-failed") });
  }
});
