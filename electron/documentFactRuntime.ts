import { inspectDocumentFactBatch } from "./documentFactInspector";
import { createDocumentFactService } from "./documentFactService";
import { notifySearchIndexChanged } from "./searchIndexChangeRuntime";
import { listPendingDocumentFactCandidates, writeDocumentFactBatch } from "./sqliteImageIndex";

export const documentFactService = createDocumentFactService({
  listPendingCandidates: listPendingDocumentFactCandidates,
  inspectBatch: inspectDocumentFactBatch,
  writeBatch: async (records) => {
    const written = await writeDocumentFactBatch(records);
    if (written > 0) notifySearchIndexChanged();
    return written;
  }
});

export const enqueueDocumentFactsForDirectories = (directoryIds: string[]) => documentFactService.enqueueDirectories(directoryIds);
export const discardDocumentFactsForDirectory = (directoryPath: string) => documentFactService.discardDirectory(directoryPath);
export const setDocumentFactForegroundActive = (active: boolean) => documentFactService.setForegroundActive(active);
