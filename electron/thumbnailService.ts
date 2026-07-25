import fs from "node:fs/promises";
import path from "node:path";
import {
  clearVisualCaches,
  deleteVisualCachesForDirectory,
  deleteVisualCachesForImages,
  getVisualCacheDirectory,
  getVisualCacheStats,
  initializeVisualCacheDirectories
} from "./visualCacheService";
import { ensureSearchThumbnailPath } from "./visualRenderService";

let thumbnailCacheFileInventory: Set<string> | null = null;
let thumbnailCacheFileInventoryPromise: Promise<Set<string>> | null = null;
let thumbnailCacheFileInventoryRevision = 0;

export const getThumbnailCacheDirectory = () => getVisualCacheDirectory("search-thumbnail");

export const initializeThumbnailCache = () => initializeVisualCacheDirectories();

const addThumbnailPathToInventory = (thumbnailPath: string) => {
  thumbnailCacheFileInventory?.add(path.basename(thumbnailPath));
  thumbnailCacheFileInventory?.add(path.basename(`${thumbnailPath}.json`));
};

const invalidateThumbnailCacheFileInventory = () => {
  thumbnailCacheFileInventoryRevision += 1;
  thumbnailCacheFileInventory = null;
  thumbnailCacheFileInventoryPromise = null;
};

export const getThumbnailCacheFileInventory = async () => {
  if (thumbnailCacheFileInventory) {
    return thumbnailCacheFileInventory;
  }
  if (thumbnailCacheFileInventoryPromise) {
    return thumbnailCacheFileInventoryPromise;
  }

  const inventoryRevision = thumbnailCacheFileInventoryRevision;
  const inventoryPromise = (async () => {
    await initializeThumbnailCache();
    const entries = await fs.readdir(getThumbnailCacheDirectory(), { withFileTypes: true });
    const inventory = new Set(
      entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
    );
    if (inventoryRevision === thumbnailCacheFileInventoryRevision) {
      thumbnailCacheFileInventory = inventory;
    }
    return inventory;
  })();
  thumbnailCacheFileInventoryPromise = inventoryPromise;

  return inventoryPromise.finally(() => {
    if (thumbnailCacheFileInventoryPromise === inventoryPromise) {
      thumbnailCacheFileInventoryPromise = null;
    }
  });
};

export const ensureThumbnailPath = async (filePath: string) => {
  const thumbnailPath = await ensureSearchThumbnailPath(filePath);
  addThumbnailPathToInventory(thumbnailPath);
  return thumbnailPath;
};

export const deleteThumbnailsForImages = async (filePaths: string[]) => {
  await deleteVisualCachesForImages(filePaths);
  invalidateThumbnailCacheFileInventory();
};

export const deleteThumbnailsForDirectory = async (directoryPath: string, knownFilePaths: string[] = []) => {
  await deleteVisualCachesForDirectory(directoryPath);
  await deleteVisualCachesForImages(knownFilePaths);
  invalidateThumbnailCacheFileInventory();
};

export const clearAllVisualCaches = async () => {
  const stats = await clearVisualCaches();
  invalidateThumbnailCacheFileInventory();
  return stats;
};

export const getAllVisualCacheStats = () => getVisualCacheStats();
