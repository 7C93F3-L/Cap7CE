import { listRecognizedImageFilePaths } from "./sqliteImageIndex";
import { deleteVisualCachesForImagesByType } from "./visualCacheService";

export interface ModelInputCacheCleanupResult {
  recognizedCount: number;
  deletedCount: number;
}

export const cleanupRecognizedModelInputCaches = async (): Promise<ModelInputCacheCleanupResult> => {
  const recognizedFilePaths = await listRecognizedImageFilePaths();
  const deletedCount = await deleteVisualCachesForImagesByType(
    recognizedFilePaths,
    "model-input-image"
  );

  return {
    recognizedCount: recognizedFilePaths.length,
    deletedCount
  };
};
