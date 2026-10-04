import { ensureSearchShellThumbnailPath } from "./shellThumbnailProvider";
import { notifySearchIndexChanged } from "./searchIndexChangeRuntime";
import {
  filterPendingVideoColorAnalysisCandidates,
  listPendingVideoColorCandidates,
  writeVideoColorBatch
} from "./sqliteImageIndex";
import { createVideoColorService } from "./videoColorService";
import { createVisualPropertyService } from "./visualPropertyService";

const analysisService = createVisualPropertyService({
  filterPendingCandidates: filterPendingVideoColorAnalysisCandidates,
  writeBatch: async (records) => {
    const written = await writeVideoColorBatch(records);
    if (written > 0) notifySearchIndexChanged();
    return written;
  },
  initialDelayMs: 250,
  yieldMs: 50,
  foregroundYieldMs: 1_500
});

export const videoColorService = createVideoColorService({
  listPendingCandidates: listPendingVideoColorCandidates,
  ensureThumbnailPath: ensureSearchShellThumbnailPath,
  enqueueAnalysis: analysisService.enqueue,
  writeBatch: async (records) => {
    const written = await writeVideoColorBatch(records);
    if (written > 0) notifySearchIndexChanged();
    return written;
  }
});

export const enqueueVideoColorsForDirectories = (directoryIds: string[]) => videoColorService.enqueueDirectories(directoryIds);
export const discardVideoColorsForDirectory = (directoryPath: string) => {
  videoColorService.discardDirectory(directoryPath);
  analysisService.discardDirectory(directoryPath);
};
export const setVideoColorForegroundActive = (active: boolean) => {
  videoColorService.setForegroundActive(active);
  analysisService.setForegroundActive(active);
};
