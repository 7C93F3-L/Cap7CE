import { inspectTextDataFactBatch } from "./textDataFactInspector";
import { createTextDataFactService } from "./textDataFactService";
import { notifySearchIndexChanged } from "./searchIndexChangeRuntime";
import { listPendingTextDataFactCandidates, writeTextDataFactBatch } from "./sqliteImageIndex";

export const textDataFactService = createTextDataFactService({
  listPendingCandidates: listPendingTextDataFactCandidates,
  inspectBatch: inspectTextDataFactBatch,
  writeBatch: async (records) => {
    const written = await writeTextDataFactBatch(records);
    if (written > 0) notifySearchIndexChanged();
    return written;
  }
});

export const enqueueTextDataFactsForDirectories = (directoryIds: string[]) => textDataFactService.enqueueDirectories(directoryIds);
export const discardTextDataFactsForDirectory = (directoryPath: string) => textDataFactService.discardDirectory(directoryPath);
export const setTextDataFactForegroundActive = (active: boolean) => textDataFactService.setForegroundActive(active);
