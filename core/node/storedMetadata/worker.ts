import { parentPort, workerData } from "node:worker_threads";
import { readStoredIndex } from "./reader";
// Parent supplies the immutable application root; the wire never accepts a database path.
try { parentPort?.postMessage(readStoredIndex(workerData.root, workerData.request)); }
catch { parentPort?.postMessage(null); }
