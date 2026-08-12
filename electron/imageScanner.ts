import fs from "node:fs/promises";
import path from "node:path";
import type { DirectoryScanSummary, PersistedDirectory } from "./directoryStore";
import { getFileFormatCapability } from "./formatCapabilities";
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

export interface ScannedFile {
  directory_id: string;
  directory_path: string;
  file_path: string;
  file_name: string;
  extension: string;
  file_size: number;
  created_at: string;
  modified_at: string;
  modified_ms: number;
}

export interface DirectoryImageScanResult {
  directory_id: string;
  directory_path: string;
  status: "ready" | "missing" | "error";
  file_count: number;
  image_count: number;
  skipped_files: number;
  skipped_directories: number;
  error?: string;
}

export interface ImageScanResult {
  scannedAt: string;
  directories: DirectoryImageScanResult[];
  files: ScannedFile[];
  images: ScannedImageFile[];
  summaries: DirectoryScanSummary[];
}

export interface ImageScanControl {
  isCancelled: () => boolean;
}

const throwIfCancelled = (control?: ImageScanControl) => {
  if (control?.isCancelled()) {
    throw Object.assign(new Error("Image scan cancelled."), { code: "ECANCELED" });
  }
};

const toIso = (date: Date) => date.toISOString();

export const isSupportedImageFilePath = (filePath: string) => (
  supportedVisualFileExtensionSet.has(path.extname(filePath).toLowerCase())
);

const scanDirectoryRecursive = async (
  rootDirectory: PersistedDirectory,
  currentPath: string,
  control?: ImageScanControl
): Promise<{ files: ScannedFile[]; images: ScannedImageFile[]; skippedFiles: number; skippedDirectories: number }> => {
  const files: ScannedFile[] = [];
  const images: ScannedImageFile[] = [];
  let skippedFiles = 0;
  let skippedDirectories = 0;

  let entries: import("node:fs").Dir;
  throwIfCancelled(control);
  try {
    entries = await fs.opendir(currentPath);
  } catch {
    return { files, images, skippedFiles, skippedDirectories: skippedDirectories + 1 };
  }

  for await (const entry of entries) {
    throwIfCancelled(control);
    const entryPath = path.join(currentPath, entry.name);

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      if (isCap7CECachePath(entryPath)) {
        continue;
      }
      const nested = await scanDirectoryRecursive(rootDirectory, entryPath, control);
      files.push(...nested.files);
      images.push(...nested.images);
      skippedFiles += nested.skippedFiles;
      skippedDirectories += nested.skippedDirectories;
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    const capability = getFileFormatCapability(extension);
    if (!capability?.canIndex) continue;

    throwIfCancelled(control);
    try {
      const stat = await fs.stat(entryPath);
      const scannedFile: ScannedFile = {
        directory_id: rootDirectory.id,
        directory_path: rootDirectory.path,
        file_path: entryPath,
        file_name: entry.name,
        extension,
        file_size: stat.size,
        created_at: toIso(stat.birthtime),
        modified_at: toIso(stat.mtime),
        modified_ms: stat.mtimeMs
      };
      files.push(scannedFile);
      if (capability.canAIIndex) {
        images.push(scannedFile);
      }
    } catch {
      skippedFiles += 1;
    }
  }

  return { files, images, skippedFiles, skippedDirectories };
};

const scanSingleDirectory = async (
  directory: PersistedDirectory,
  scannedAt: string,
  control?: ImageScanControl
): Promise<{ directoryResult: DirectoryImageScanResult; files: ScannedFile[]; images: ScannedImageFile[]; summary: DirectoryScanSummary }> => {
  throwIfCancelled(control);
  try {
    const stat = await fs.stat(directory.path);
    if (!stat.isDirectory()) {
      const error = t("scan.directoryInvalid");
      return {
        directoryResult: {
          directory_id: directory.id,
          directory_path: directory.path,
          status: "missing",
          file_count: 0,
          image_count: 0,
          skipped_files: 0,
          skipped_directories: 0,
          error
        },
        files: [],
        images: [],
        summary: {
          id: directory.id,
          indexedCount: 0,
          fileCount: 0,
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
        file_count: 0,
        image_count: 0,
        skipped_files: 0,
        skipped_directories: 0,
        error
      },
      files: [],
      images: [],
      summary: {
        id: directory.id,
        indexedCount: 0,
        fileCount: 0,
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
        file_count: 0,
        image_count: 0,
        skipped_files: 0,
        skipped_directories: 0
      },
      files: [],
      images: [],
      summary: {
        id: directory.id,
        indexedCount: 0,
        fileCount: 0,
        lastScannedAt: scannedAt,
        scanStatus: "ready"
      }
    };
  }

  const scan = await scanDirectoryRecursive(directory, directory.path, control);
  const status = scan.skippedDirectories > 0 ? "error" : "ready";
  const error = status === "error" ? t("scan.skippedDirectories", { count: scan.skippedDirectories }) : undefined;

  return {
    directoryResult: {
      directory_id: directory.id,
      directory_path: directory.path,
      status,
      file_count: scan.files.length,
      image_count: scan.images.length,
      skipped_files: scan.skippedFiles,
      skipped_directories: scan.skippedDirectories,
      error
    },
    files: scan.files,
    images: scan.images,
    summary: {
      id: directory.id,
      indexedCount: scan.images.length,
      fileCount: scan.files.length,
      lastScannedAt: scannedAt,
      scanStatus: status,
      scanError: error
    }
  };
};

export const scanImageDirectories = async (
  directories: PersistedDirectory[],
  control?: ImageScanControl
): Promise<ImageScanResult> => {
  const scannedAt = new Date().toISOString();
  const directoryResults: DirectoryImageScanResult[] = [];
  const allFiles: ScannedFile[] = [];
  const allImages: ScannedImageFile[] = [];
  const summaries: DirectoryScanSummary[] = [];

  for (const directory of directories) {
    throwIfCancelled(control);
    const result = await scanSingleDirectory(directory, scannedAt, control);
    directoryResults.push(result.directoryResult);
    allFiles.push(...result.files);
    allImages.push(...result.images);
    summaries.push(result.summary);
  }

  return {
    scannedAt,
    directories: directoryResults,
    files: allFiles,
    images: allImages,
    summaries
  };
};
import { t } from "./localization";
