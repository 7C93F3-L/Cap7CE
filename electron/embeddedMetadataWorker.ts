import { parentPort } from "node:worker_threads";
import { extractEmbeddedMetadata } from "./embeddedMetadataExtractor";

interface ExtractionRequest {
  id: number;
  filePath: string;
}

if (!parentPort) throw new Error("Embedded metadata worker requires a parent port.");

parentPort.on("message", async (request: ExtractionRequest) => {
  try {
    parentPort?.postMessage({
      id: request.id,
      extraction: await extractEmbeddedMetadata(request.filePath)
    });
  } catch (error) {
    parentPort?.postMessage({
      id: request.id,
      errorCode: (error as NodeJS.ErrnoException).code === "ENOENT" ? "source-unavailable" : "metadata-read-failed"
    });
  }
});
