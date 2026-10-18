import { createEmbeddedMetadataService } from "./embeddedMetadataService";
import type { ScannedFile, ScannedImageFile } from "./imageScanner";
import {
  discardImageDimensionsForDirectory,
  enqueueImageDimensionsForDirectories
} from "./imageDimensionRuntime";
import { discardAnimationFactsForDirectory, enqueueAnimationFactsForDirectories } from "./animationFactRuntime";
import { notifySearchIndexChanged } from "./searchIndexChangeRuntime";
import { discardVideoFactsForDirectory, enqueueVideoFactsForDirectories } from "./videoFactRuntime";
import { discardVideoColorsForDirectory, enqueueVideoColorsForDirectories } from "./videoColorRuntime";
import { discardAudioFactsForDirectory, enqueueAudioFactsForDirectories } from "./audioFactRuntime";
import { discardDocumentFactsForDirectory, enqueueDocumentFactsForDirectories } from "./documentFactRuntime";
import { discardTextDataFactsForDirectory, enqueueTextDataFactsForDirectories } from "./textDataFactRuntime";
import { discardThreeDFactsForDirectory, enqueueThreeDFactsForDirectories } from "./threeDFactRuntime";
import { discardArchiveFactsForDirectory, enqueueArchiveFactsForDirectories } from "./archiveFactRuntime";
import { discardFontFactsForDirectory, enqueueFontFactsForDirectories } from "./fontFactRuntime";
import { discardModelFactsForDirectory, enqueueModelFactsForDirectories } from "./modelFactRuntime";
import {
  listPendingEmbeddedMetadataCandidates,
  writeEmbeddedMetadataBatch,
  writeScannedImagesToIndex
} from "./sqliteImageIndex";

export const embeddedMetadataService = createEmbeddedMetadataService({
  listPendingCandidates: listPendingEmbeddedMetadataCandidates,
  writeBatch: async (...args) => {
    const written = await writeEmbeddedMetadataBatch(...args);
    if (written > 0) notifySearchIndexChanged();
    return written;
  }
});

export const writeScannedFilesWithEmbeddedMetadata = async (
  directoryIds: string[],
  images: ScannedImageFile[],
  scannedAt: string,
  files: ScannedFile[]
) => {
  const result = await writeScannedImagesToIndex(directoryIds, images, scannedAt, files);
  void embeddedMetadataService.enqueueDirectories(directoryIds);
  void enqueueImageDimensionsForDirectories(directoryIds);
  void enqueueAnimationFactsForDirectories(directoryIds);
  void enqueueVideoFactsForDirectories(directoryIds);
  void enqueueVideoColorsForDirectories(directoryIds);
  void enqueueAudioFactsForDirectories(directoryIds);
  void enqueueDocumentFactsForDirectories(directoryIds);
  void enqueueTextDataFactsForDirectories(directoryIds);
  void enqueueThreeDFactsForDirectories(directoryIds);
  void enqueueArchiveFactsForDirectories(directoryIds);
  void enqueueFontFactsForDirectories(directoryIds);
  void enqueueModelFactsForDirectories(directoryIds);
  return result;
};

export const discardEmbeddedMetadataForDirectory = async (directoryPath: string) => {
  discardImageDimensionsForDirectory(directoryPath);
  discardAnimationFactsForDirectory(directoryPath);
  discardVideoFactsForDirectory(directoryPath);
  discardVideoColorsForDirectory(directoryPath);
  discardAudioFactsForDirectory(directoryPath);
  discardDocumentFactsForDirectory(directoryPath);
  discardTextDataFactsForDirectory(directoryPath);
  discardThreeDFactsForDirectory(directoryPath);
  discardArchiveFactsForDirectory(directoryPath);
  discardFontFactsForDirectory(directoryPath);
  discardModelFactsForDirectory(directoryPath);
  await embeddedMetadataService.discardDirectory(directoryPath);
};

export const setEmbeddedMetadataForegroundActive = (active: boolean) => {
  embeddedMetadataService.setForegroundActive(active);
};
