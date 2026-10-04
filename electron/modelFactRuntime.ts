import { inspectModelFactBatch } from "./modelFactInspector";
import { createModelFactService } from "./modelFactService";
import { notifySearchIndexChanged } from "./searchIndexChangeRuntime";
import { listPendingModelFactCandidates, writeModelFactBatch } from "./sqliteImageIndex";

export const modelFactService = createModelFactService({
  listPendingCandidates: listPendingModelFactCandidates,
  inspectBatch: inspectModelFactBatch,
  writeBatch: async (records) => {
    const written = await writeModelFactBatch(records);
    if (written > 0) notifySearchIndexChanged();
    return written;
  }
});
export const enqueueModelFactsForDirectories = (directoryIds: string[]) => modelFactService.enqueueDirectories(directoryIds);
export const discardModelFactsForDirectory = (directoryPath: string) => modelFactService.discardDirectory(directoryPath);
export const setModelFactForegroundActive = (active: boolean) => modelFactService.setForegroundActive(active);
