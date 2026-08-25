import { createImageDimensionService } from "./imageDimensionService";
import {
  listPendingImageDimensionCandidates,
  writeImageDimensionBatch
} from "./sqliteImageIndex";
import { notifySearchIndexChanged } from "./searchIndexChangeRuntime";

export const imageDimensionService = createImageDimensionService({
  listPendingCandidates: listPendingImageDimensionCandidates,
  writeBatch: async (records) => {
    const written = await writeImageDimensionBatch(records);
    if (written > 0) notifySearchIndexChanged();
    return written;
  }
});

export const enqueueImageDimensionsForDirectories = (directoryIds: string[]) => (
  imageDimensionService.enqueueDirectories(directoryIds)
);

export const discardImageDimensionsForDirectory = (directoryPath: string) => {
  imageDimensionService.discardDirectory(directoryPath);
};

export const setImageDimensionForegroundActive = (active: boolean) => {
  imageDimensionService.setForegroundActive(active);
};
