import { promises as fs } from "node:fs";
import { deleteFilesByFilePaths, listIndexedFilePaths } from "./sqliteImageIndex";

const accessBatchSize = 64;

export interface StaleFileCleanupResult {
  checkedCount: number;
  removedFilePaths: string[];
  errors: string[];
}

const isMissingFileError = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
};

export const cleanupMissingIndexedFiles = async (
  directoryId?: string
): Promise<StaleFileCleanupResult> => {
  const errors: string[] = [];
  let indexedFilePaths: string[];

  try {
    indexedFilePaths = await listIndexedFilePaths(directoryId);
  } catch (error) {
    return {
      checkedCount: 0,
      removedFilePaths: [],
      errors: [`Failed to read indexed file paths: ${error instanceof Error ? error.message : String(error)}`]
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
        if (isMissingFileError(error)) return true;
        errors.push(
          `Failed to check indexed file "${filePath}": ${error instanceof Error ? error.message : String(error)}`
        );
        return false;
      }
    }));

    results.forEach((isMissing, index) => {
      if (isMissing) missingFilePaths.push(batch[index]);
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
    await deleteFilesByFilePaths(missingFilePaths);
  } catch (error) {
    errors.push(
      `Failed to remove missing files from the catalog: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      checkedCount: indexedFilePaths.length,
      removedFilePaths: [],
      errors
    };
  }

  return {
    checkedCount: indexedFilePaths.length,
    removedFilePaths: missingFilePaths,
    errors
  };
};
