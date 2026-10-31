import { parentPort, workerData } from "node:worker_threads";
import fs from "node:fs/promises";
import path from "node:path";
import { extractEmbeddedMetadata } from "../embeddedMetadata/domain/embeddedMetadataExtractor";
import { toPreviewMetadata } from "./contracts/previewMetadataProjection";

if (!parentPort || typeof workerData !== "string" || workerData.length > 32767 || workerData.includes("\0") || !path.isAbsolute(workerData))
  throw new Error("core-preview-invalid-source");
// Read-only and transient. Neither this worker nor its owner publishes index or cache records.
void (async () => {
  const before = await fs.lstat(workerData, { bigint: true }), extraction = await extractEmbeddedMetadata(workerData), after = await fs.lstat(workerData, { bigint: true });
  const unchanged = before.isFile() && !before.isSymbolicLink() && after.isFile() && !after.isSymbolicLink()
    && before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeNs === after.mtimeNs;
  parentPort!.postMessage(unchanged ? toPreviewMetadata(extraction) : null);
})().catch(() => parentPort!.postMessage(null));
