import { inspectArchiveFactBatch } from "./archiveFactInspector";
import { createArchiveFactService } from "./archiveFactService";
import { notifySearchIndexChanged } from "./searchIndexChangeRuntime";
import { listPendingArchiveFactCandidates, writeArchiveFactBatch } from "./sqliteImageIndex";

export const archiveFactService = createArchiveFactService({
  listPendingCandidates: listPendingArchiveFactCandidates,
  inspectBatch: inspectArchiveFactBatch,
  writeBatch: async (records) => {
    const written = await writeArchiveFactBatch(records);
    if (written > 0) notifySearchIndexChanged();
    return written;
  }
});

export const enqueueArchiveFactsForDirectories = (directoryIds: string[]) => archiveFactService.enqueueDirectories(directoryIds);
export const discardArchiveFactsForDirectory = (directoryPath: string) => archiveFactService.discardDirectory(directoryPath);
export const setArchiveFactForegroundActive = (active: boolean) => archiveFactService.setForegroundActive(active);
