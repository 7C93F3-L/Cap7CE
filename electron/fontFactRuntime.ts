import { inspectFontFactBatch } from "./fontFactInspector";
import { createFontFactService } from "./fontFactService";
import { notifySearchIndexChanged } from "./searchIndexChangeRuntime";
import { listPendingFontFactCandidates, writeFontFactBatch } from "./sqliteImageIndex";

export const fontFactService = createFontFactService({
  listPendingCandidates: listPendingFontFactCandidates,
  inspectBatch: inspectFontFactBatch,
  writeBatch: async (records) => {
    const written = await writeFontFactBatch(records);
    if (written > 0) notifySearchIndexChanged();
    return written;
  }
});
export const enqueueFontFactsForDirectories = (directoryIds: string[]) => fontFactService.enqueueDirectories(directoryIds);
export const discardFontFactsForDirectory = (directoryPath: string) => fontFactService.discardDirectory(directoryPath);
export const setFontFactForegroundActive = (active: boolean) => fontFactService.setForegroundActive(active);
