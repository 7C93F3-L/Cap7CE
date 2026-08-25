import { filterPendingVisualPropertyCandidates, writeVisualPropertyBatch } from "./sqliteImageIndex";
import { onThumbnailLifecycle } from "./thumbnailService";
import { createVisualPropertyService } from "./visualPropertyService";
import { setImageDimensionForegroundActive } from "./imageDimensionRuntime";
import { setAnimationFactForegroundActive } from "./animationFactRuntime";
import { notifySearchIndexChanged } from "./searchIndexChangeRuntime";
import { setEmbeddedMetadataForegroundActive } from "./embeddedMetadataRuntime";

export const visualPropertyService = createVisualPropertyService({
  filterPendingCandidates: filterPendingVisualPropertyCandidates,
  writeBatch: async (...args) => {
    const written = await writeVisualPropertyBatch(...args);
    if (written > 0) notifySearchIndexChanged();
    return written;
  }
});

export const setVisualPropertyForegroundActive = (active: boolean) => {
  visualPropertyService.setForegroundActive(active);
  setImageDimensionForegroundActive(active);
  setAnimationFactForegroundActive(active);
  setEmbeddedMetadataForegroundActive(active);
};

onThumbnailLifecycle((event) => {
  if (event.kind === "available") visualPropertyService.enqueue(event);
  else if (event.kind === "discard-files") visualPropertyService.discardFiles(event.filePaths);
  else visualPropertyService.discardDirectory(event.directoryPath);
});
