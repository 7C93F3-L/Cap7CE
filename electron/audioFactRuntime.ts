import { inspectAudioFactBatch } from "./audioFactInspector";
import { createAudioFactService } from "./audioFactService";
import { notifySearchIndexChanged } from "./searchIndexChangeRuntime";
import { listPendingAudioFactCandidates, writeAudioFactBatch } from "./sqliteImageIndex";

export const audioFactService = createAudioFactService({
  listPendingCandidates: listPendingAudioFactCandidates,
  inspectBatch: inspectAudioFactBatch,
  writeBatch: async (records) => {
    const written = await writeAudioFactBatch(records);
    if (written > 0) notifySearchIndexChanged();
    return written;
  }
});

export const enqueueAudioFactsForDirectories = (directoryIds: string[]) => audioFactService.enqueueDirectories(directoryIds);
export const discardAudioFactsForDirectory = (directoryPath: string) => audioFactService.discardDirectory(directoryPath);
export const setAudioFactForegroundActive = (active: boolean) => audioFactService.setForegroundActive(active);
