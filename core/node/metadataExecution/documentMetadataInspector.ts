import path from "node:path";
import { readArtboardFact, readDocumentFact } from "../fileFacts/domain/documentFactExtractor";
import type { MetadataDocumentProperties } from "./metadataWorkerTypes";

// Runs in the owned OS helper. PDF's native dependencies stay in this process;
// do not repeatedly load/unload them through temporary worker_threads.
// Cancellation and the hard deadline retire this helper and all its source handles.
export const inspectDocumentMetadata = async (filePath: string, signal: AbortSignal): Promise<MetadataDocumentProperties> => {
  signal.throwIfAborted();
  const extension = path.extname(filePath).toLowerCase();
  if ([".ai", ".cdr", ".psd"].includes(extension)) {
    const artboardCount = await readArtboardFact(filePath);
    signal.throwIfAborted();
    return { artboardCount };
  }
  const document = await readDocumentFact(filePath);
  signal.throwIfAborted();
  return { contentCount: document.contentCount, countKind: document.countKind,
    ...(document.imageCompositionKnown ? { hasEmbeddedImages: document.hasEmbeddedImages } : {}) };
};
