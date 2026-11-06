import { extractEmbeddedMetadata } from "../embeddedMetadata/domain/embeddedMetadataExtractor";
import type { MetadataWorkerTask, MetadataWorkerResult } from "./metadataWorkerTypes";

// Preserve the legacy high-value selection; leave room in the private 256 KiB response frame.
export async function withSearchEvidence(task: MetadataWorkerTask, result: MetadataWorkerResult, signal: AbortSignal) {
  if (result.state !== "indexed" || !["image-dimensions", "video"].includes(task.kind)) return result;
  signal.throwIfAborted();
  const evidence = (await extractEmbeddedMetadata(task.filePath)).evidence.map(item => ({ kind: item.kind, text: item.searchText }));
  signal.throwIfAborted();
  while (Buffer.byteLength(JSON.stringify(evidence)) > 192 * 1024) {
    const longest = evidence.reduce((a, b) => a.text.length >= b.text.length ? a : b);
    longest.text = longest.text.slice(0, Math.floor(longest.text.length / 2));
  }
  return { ...result, searchEvidence: evidence };
}
