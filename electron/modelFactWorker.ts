import { parentPort, workerData } from "node:worker_threads";
import { extractModelFact } from "./modelFactExtractor";

const sourcePath = typeof workerData?.sourcePath === "string" ? workerData.sourcePath : "";
if (!parentPort || !sourcePath) throw new Error("model-fact-worker-invalid-request");
const port = parentPort;
void extractModelFact(sourcePath).then(
  (data) => port.postMessage({ ok: true, data }),
  (error) => port.postMessage({ ok: false, errorCode: error instanceof Error ? error.message : "model-fact-invalid-model" })
);
