import { parentPort, workerData } from "node:worker_threads";
import { readSkimTextPreview } from "./reader";
void readSkimTextPreview(workerData).then(value => parentPort?.postMessage({ ok: true, value }), error => parentPort?.postMessage({
  ok: false, error: { code: typeof error?.code === "string" ? error.code.slice(0, 64) : "EIO", message: String(error?.message ?? error).slice(0, 1024) }
}));
