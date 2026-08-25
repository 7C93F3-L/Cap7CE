import { promises as fs } from "node:fs";
import {
  deleteImagesByFilePaths,
  listIndexedImageFilePaths
} from "./sqliteImageIndex";
import { deleteVisualCachesForImages } from "./visualCacheService";

const accessBatchSize = 64;

export interface StaleImageCleanupResult {
  checkedCount: number;
  removedFilePaths: string[];
  errors: string[];
}

const isMissingFileError = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
};

export const cleanupMissingIndexedImages = async (
  directoryId?: string
): Promise<StaleImageCleanupResult> => {
  const errors: string[] = [];
  let indexedFilePaths: string[];

  try {
    indexedFilePaths = await listIndexedImageFilePaths(directoryId);
  } catch (error) {
    return {
      checkedCount: 0,
      removedFilePaths: [],
      errors: [
        `Failed to read indexed image paths: ${error instanceof Error ? error.message : String(error)}`
      ]
    };
  }

  const missingFilePaths: string[] = [];
  for (let offset = 0; offset < indexedFilePaths.length; offset += accessBatchSize) {
    const batch = indexedFilePaths.slice(offset, offset + accessBatchSize);
    const results = await Promise.all(batch.map(async (filePath) => {
      try {
        await fs.access(filePath);
        return false;
      } catch (error) {
        if (isMissingFileError(error)) {
          return true;
        }
        errors.push(
          `Failed to check indexed image "${filePath}": ${error instanceof Error ? error.message : String(error)}`
        );
        return false;
      }
    }));

    results.forEach((isMissing, index) => {
      if (isMissing) {
        missingFilePaths.push(batch[index]);
      }
    });
  }

  if (missingFilePaths.length === 0) {
    return {
      checkedCount: indexedFilePaths.length,
      removedFilePaths: [],
      errors
    };
  }

  try {
    await deleteImagesByFilePaths(missingFilePaths);
  } catch (error) {
    errors.push(
      `Failed to remove missing images from the index: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      checkedCount: indexedFilePaths.length,
      removedFilePaths: [],
      errors
    };
  }

  try {
    await deleteVisualCachesForImages(missingFilePaths);
  } catch (error) {
    errors.push(
      `Missing image records were removed, but cache cleanup failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    checkedCount: indexedFilePaths.length,
    removedFilePaths: missingFilePaths,
    errors
  };
};
