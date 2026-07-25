import fs from "node:fs/promises";
import path from "node:path";
import type { DirectoryScanSummary, PersistedDirectory } from "./directoryStore";
import { supportedVisualFileExtensionSet } from "./supportedVisualFormats";
import { isCap7CECachePath } from "./visualCacheService";

export interface ScannedImageFile {
  directory_id: string;
  directory_path: string;
  file_path: string;
  file_name: string;
  file_size: number;
  created_at: string;
  modified_at: string;
  modified_ms: number;
}

export interface DirectoryImageScanResult {
  directory_id: string;
  directory_path: string;
  status: "ready" | "missing" | "error";
  image_count: number;
  skipped_files: number;
  skipped_directories: number;
  error?: string;
}

export interface ImageScanResult {
  scannedAt: string;
  directories: DirectoryImageScanResult[];
  images: ScannedImageFile[];
  summaries: DirectoryScanSummary[];
}

const toIso = (date: Date) => date.toISOString();

export const isSupportedImageFilePath = (filePath: string) => (
  supportedVisualFileExtensionSet.has(path.extname(filePath).toLowerCase())
);

const scanDirectoryRecursive = async (rootDirectory: PersistedDirectory, currentPath: string): Promise<{ images: ScannedImageFile[]; skippedFiles: number; skippedDirectories: number }> => {
  const images: ScannedImageFile[] = [];
  let skippedFiles = 0;
  let skippedDirectories = 0;

  let entries: import("node:fs").Dir;
  try {
    entries = await fs.opendir(currentPath);
  } catch {
    return { images, skippedFiles, skippedDirectories: skippedDirectories + 1 };
  }

  for await (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name);

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      if (isCap7CECachePath(entryPath)) {
        continue;
      }
      const nested = await scanDirectoryRecursive(rootDirectory, entryPath);
      images.push(...nested.images);
      skippedFiles += nested.skippedFiles;
      skippedDirectories += nested.skippedDirectories;
      continue;
    }

    if (!entry.isFile() || !isSupportedImageFilePath(entry.name)) {
      continue;
    }

    try {
      const stat = await fs.stat(entryPath);
      images.push({
        directory_id: rootDirectory.id,
        directory_path: rootDirectory.path,
        file_path: entryPath,
        file_name: entry.name,
        file_size: stat.size,
        created_at: toIso(stat.birthtime),
        modified_at: toIso(stat.mtime),
        modified_ms: stat.mtimeMs
      });
    } catch {
      skippedFiles += 1;
    }
  }

  return { images, skippedFiles, skippedDirectories };
};

const scanSingleDirectory = async (directory: PersistedDirectory, scannedAt: string): Promise<{ directoryResult: DirectoryImageScanResult; images: ScannedImageFile[]; summary: DirectoryScanSummary }> => {
  try {
    const stat = await fs.stat(directory.path);
    if (!stat.isDirectory()) {
      const error = t("scan.directoryInvalid");
      return {
        directoryResult: {
          directory_id: directory.id,
          directory_path: directory.path,
          status: "missing",
          image_count: 0,
          skipped_files: 0,
          skipped_directories: 0,
          error
        },
        images: [],
        summary: {
          id: directory.id,
          indexedCount: 0,
          lastScannedAt: scannedAt,
          scanStatus: "missing",
          scanError: error
        }
      };
    }
  } catch {
    const error = t("scan.directoryUnavailable");
    return {
      directoryResult: {
        directory_id: directory.id,
        directory_path: directory.path,
        status: "missing",
        image_count: 0,
        skipped_files: 0,
        skipped_directories: 0,
        error
      },
      images: [],
      summary: {
        id: directory.id,
        indexedCount: 0,
        lastScannedAt: scannedAt,
        scanStatus: "missing",
        scanError: error
      }
    };
  }

  if (isCap7CECachePath(directory.path)) {
    return {
      directoryResult: {
        directory_id: directory.id,
        directory_path: directory.path,
        status: "ready",
        image_count: 0,
        skipped_files: 0,
        skipped_directories: 0
      },
      images: [],
      summary: {
        id: directory.id,
        indexedCount: 0,
        lastScannedAt: scannedAt,
        scanStatus: "ready"
      }
    };
  }

  const scan = await scanDirectoryRecursive(directory, directory.path);
  const status = scan.skippedDirectories > 0 ? "error" : "ready";
  const error = status === "error" ? t("scan.skippedDirectories", { count: scan.skippedDirectories }) : undefined;

  return {
    directoryResult: {
      directory_id: directory.id,
      directory_path: directory.path,
      status,
      image_count: scan.images.length,
      skipped_files: scan.skippedFiles,
      skipped_directories: scan.skippedDirectories,
      error
    },
    images: scan.images,
    summary: {
      id: directory.id,
      indexedCount: scan.images.length,
      lastScannedAt: scannedAt,
      scanStatus: status,
      scanError: error
    }
  };
};

export const scanImageDirectories = async (directories: PersistedDirectory[]): Promise<ImageScanResult> => {
  const scannedAt = new Date().toISOString();
  const directoryResults: DirectoryImageScanResult[] = [];
  const allImages: ScannedImageFile[] = [];
  const summaries: DirectoryScanSummary[] = [];

  for (const directory of directories) {
    const result = await scanSingleDirectory(directory, scannedAt);
    directoryResults.push(result.directoryResult);
    allImages.push(...result.images);
    summaries.push(result.summary);
  }

  return {
    scannedAt,
    directories: directoryResults,
    images: allImages,
    summaries
  };
};
import { t } from "./localization";
