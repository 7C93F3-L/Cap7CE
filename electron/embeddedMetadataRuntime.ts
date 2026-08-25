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
  return result;
};

export const discardEmbeddedMetadataForDirectory = async (directoryPath: string) => {
  discardImageDimensionsForDirectory(directoryPath);
  discardAnimationFactsForDirectory(directoryPath);
  await embeddedMetadataService.discardDirectory(directoryPath);
};

export const setEmbeddedMetadataForegroundActive = (active: boolean) => {
  embeddedMetadataService.setForegroundActive(active);
};

export const configureEmbeddedMetadataRuntime = (
  registrar: IpcRegistrar,
  getMainWebContents: () => Electron.WebContents | null
) => {
  configureSearchIndexChangeRuntime(getMainWebContents);
  registerEmbeddedMetadataIpc({
    registrar,
    isSenderAllowed: (event) => event.sender === getMainWebContents(),
    getStatus: embeddedMetadataService.status,
    startBackfill: embeddedMetadataService.startBackfill,
    cancelBackfill: embeddedMetadataService.cancel
  });
  embeddedMetadataService.onStatusChanged((status) => {
    const webContents = getMainWebContents();
    if (webContents && !webContents.isDestroyed()) webContents.send("embeddedMetadata:statusChanged", status);
  });
  void enqueueImageDimensionsForDirectories([]).catch((error) => {
    console.warn("[image-dimensions] startup candidate discovery failed", error);
  });
  void enqueueAnimationFactsForDirectories([]).catch((error) => {
    console.warn("[animation-facts] startup candidate discovery failed", error);
  });
};
