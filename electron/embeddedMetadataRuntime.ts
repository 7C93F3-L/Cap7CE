import { createEmbeddedMetadataService } from "./embeddedMetadataService";
import { registerEmbeddedMetadataIpc } from "./embeddedMetadataIpc";
import type { IpcRegistrar } from "./ipcRegistration";
import type { ScannedFile, ScannedImageFile } from "./imageScanner";
import {
  discardImageDimensionsForDirectory,
  enqueueImageDimensionsForDirectories
} from "./imageDimensionRuntime";
import { discardAnimationFactsForDirectory, enqueueAnimationFactsForDirectories } from "./animationFactRuntime";
import { configureSearchIndexChangeRuntime, notifySearchIndexChanged } from "./searchIndexChangeRuntime";
import { discardVideoFactsForDirectory, enqueueVideoFactsForDirectories } from "./videoFactRuntime";
import { discardVideoColorsForDirectory, enqueueVideoColorsForDirectories } from "./videoColorRuntime";
import { discardAudioFactsForDirectory, enqueueAudioFactsForDirectories } from "./audioFactRuntime";
import { discardDocumentFactsForDirectory, enqueueDocumentFactsForDirectories } from "./documentFactRuntime";
import { discardTextDataFactsForDirectory, enqueueTextDataFactsForDirectories } from "./textDataFactRuntime";
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
  await embeddedMetadataService.discardDirectory(directoryPath);
};

export const setEmbeddedMetadataForegroundActive = (active: boolean) => {
  embeddedMetadataService.setForegroundActive(active);
};

export const configureEmbeddedMetadataRuntime = (
  registrar: IpcRegistrar,
  getMainWebContents: () => Electron.WebContents | null,
  getSettingsWebContents: () => Electron.WebContents | null
) => {
  configureSearchIndexChangeRuntime(getMainWebContents);
  const getActiveWebContents = () => {
    const candidates = [getMainWebContents(), getSettingsWebContents()];
    return candidates.filter((webContents, index) => webContents
      && !webContents.isDestroyed()
      && candidates.indexOf(webContents) === index) as Electron.WebContents[];
  };
  registerEmbeddedMetadataIpc({
    registrar,
    isSenderAllowed: (event) => getActiveWebContents().includes(event.sender),
    getStatus: embeddedMetadataService.status,
    startBackfill: embeddedMetadataService.startBackfill,
    cancelBackfill: embeddedMetadataService.cancel
  });
  embeddedMetadataService.onStatusChanged((status) => {
    for (const webContents of getActiveWebContents()) {
      webContents.send("embeddedMetadata:statusChanged", status);
    }
  });
  void enqueueImageDimensionsForDirectories([]).catch((error) => {
    console.warn("[image-dimensions] startup candidate discovery failed", error);
  });
  void enqueueAnimationFactsForDirectories([]).catch((error) => {
    console.warn("[animation-facts] startup candidate discovery failed", error);
  });
  void enqueueVideoFactsForDirectories([]).catch((error) => {
    console.warn("[video-facts] startup candidate discovery failed", error);
  });
  void enqueueVideoColorsForDirectories([]).catch((error) => {
    console.warn("[video-colors] startup candidate discovery failed", error);
  });
  void enqueueAudioFactsForDirectories([]).catch((error) => {
    console.warn("[audio-facts] startup candidate discovery failed", error);
  });
  void enqueueDocumentFactsForDirectories([]).catch((error) => {
    console.warn("[document-facts] startup candidate discovery failed", error);
  });
  void enqueueTextDataFactsForDirectories([]).catch((error) => {
    console.warn("[text-data-facts] startup candidate discovery failed", error);
  });
};
