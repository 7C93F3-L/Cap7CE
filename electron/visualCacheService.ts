import { app } from "electron";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { CACHE_VERSION, RENDER_STRATEGY_VERSION } from "./versioning";

export type VisualCacheType = "search-thumbnail" | "model-input-image" | "preview-image";
export type VisualImageMimeType = "image/jpeg" | "image/png";

export interface VisualCacheDescriptor {
  type: VisualCacheType;
  directoryName: "thumbnails" | "model-inputs" | "previews";
  extension: ".capth" | ".capmo" | ".cappr";
}

export interface VisualCacheEntry {
  type: VisualCacheType;
  key: string;
  sourcePath: string;
  sourcePathHash: string;
  fileSize: number;
  modifiedMs: number;
  cacheVersion: number;
  renderStrategyVersion: number;
  imagePath: string;
  metadataPath: string;
}

export interface VisualCacheMetadata {
  type: VisualCacheType;
  key: string;
  sourcePath: string;
  sourcePathHash: string;
  fileSize: number;
  modifiedMs: number;
  cacheVersion: number;
  renderStrategyVersion: number;
  mimeType: VisualImageMimeType;
  generatedAt: string;
}

export interface VisualCacheImage {
  buffer: Buffer;
  mimeType: VisualImageMimeType;
}

export interface VisualCacheStats {
  cacheCount: number;
  totalBytes: number;
  cachePaths: string[];
}

export interface VisualCacheSourceMetadata {
  fileSize: number;
  modifiedMs: number;
}

const cacheDescriptors: Record<VisualCacheType, VisualCacheDescriptor> = {
  "search-thumbnail": {
    type: "search-thumbnail",
    directoryName: "thumbnails",
    extension: ".capth"
  },
  "model-input-image": {
    type: "model-input-image",
    directoryName: "model-inputs",
    extension: ".capmo"
  },
  "preview-image": {
    type: "preview-image",
    directoryName: "previews",
    extension: ".cappr"
  }
};

let cachedVisualCacheDirectories: string[] | null = null;
let visualCacheInitializationPromise: Promise<void> | null = null;

const normalizedPathForKey = (filePath: string) => {
  const resolvedPath = path.resolve(filePath);
  return process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
};

const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export const getVisualCacheDescriptor = (type: VisualCacheType) => cacheDescriptors[type];

export const getVisualCacheDirectory = (type: VisualCacheType) => (
  path.join(app.getPath("userData"), getVisualCacheDescriptor(type).directoryName)
);

export const getVisualCacheDirectories = () => (
  cachedVisualCacheDirectories ??= Object.keys(cacheDescriptors)
    .map((type) => getVisualCacheDirectory(type as VisualCacheType))
);

export const getLegacyVisualCacheDirectory = () => path.join(app.getPath("userData"), "cache");

const isPathInsideDirectory = (filePath: string, directoryPath: string) => {
  const normalizedFilePath = normalizedPathForKey(filePath);
  const normalizedDirectoryPath = normalizedPathForKey(directoryPath);
  return normalizedFilePath === normalizedDirectoryPath
    || normalizedFilePath.startsWith(`${normalizedDirectoryPath}${path.sep}`);
};

export const isCap7CECachePath = (filePath: string) => (
  [...getVisualCacheDirectories(), getLegacyVisualCacheDirectory()]
    .some((cacheDirectory) => isPathInsideDirectory(filePath, cacheDirectory))
);

export const initializeVisualCacheDirectories = async () => {
  visualCacheInitializationPromise ??= Promise.all(
    getVisualCacheDirectories().map((cacheDirectory) => fs.mkdir(cacheDirectory, { recursive: true }))
  ).then(() => undefined);
  await visualCacheInitializationPromise;
};

const isVisualCacheFile = (fileName: string, type: VisualCacheType) => {
  const extension = getVisualCacheDescriptor(type).extension;
  return fileName.endsWith(extension) || fileName.endsWith(`${extension}.json`);
};

const getVisualCacheTypeStats = async (type: VisualCacheType) => {
  const cachePath = getVisualCacheDirectory(type);
  const extension = getVisualCacheDescriptor(type).extension;
  const entries = await fs.readdir(cachePath, { withFileTypes: true });
  const cacheFiles = entries.filter((entry) => entry.isFile() && isVisualCacheFile(entry.name, type));
  const fileSizes = await Promise.all(
    cacheFiles.map(async (entry) => (await fs.stat(path.join(cachePath, entry.name))).size)
  );

  return {
    cacheCount: cacheFiles.filter((entry) => entry.name.endsWith(extension)).length,
    totalBytes: fileSizes.reduce((sum, fileSize) => sum + fileSize, 0),
    cachePath
  };
};

export const getVisualCacheStats = async (): Promise<VisualCacheStats> => {
  await initializeVisualCacheDirectories();
  const statsByType = await Promise.all(
    (Object.keys(cacheDescriptors) as VisualCacheType[]).map(getVisualCacheTypeStats)
  );

  return {
    cacheCount: statsByType.reduce((sum, stats) => sum + stats.cacheCount, 0),
    totalBytes: statsByType.reduce((sum, stats) => sum + stats.totalBytes, 0),
    cachePaths: statsByType.map((stats) => stats.cachePath)
  };
};

export const clearVisualCaches = async (): Promise<VisualCacheStats> => {
  await initializeVisualCacheDirectories();
  await Promise.all(
    (Object.keys(cacheDescriptors) as VisualCacheType[]).map(async (type) => {
      const cachePath = getVisualCacheDirectory(type);
      const entries = await fs.readdir(cachePath, { withFileTypes: true });
      await Promise.all(entries.map(async (entry) => {
        if (entry.isFile() && isVisualCacheFile(entry.name, type)) {
          await fs.rm(path.join(cachePath, entry.name), { force: true });
        }
      }));
    })
  );
  return getVisualCacheStats();
};

export const createVisualCacheEntryFromSourceMetadata = (
  sourcePath: string,
  type: VisualCacheType,
  sourceMetadata: VisualCacheSourceMetadata
): VisualCacheEntry => {
  const normalizedSourcePath = path.resolve(sourcePath);
  const sourcePathHash = hash(normalizedPathForKey(normalizedSourcePath));
  const key = hash([
    sourcePathHash,
    sourceMetadata.fileSize,
    sourceMetadata.modifiedMs,
    CACHE_VERSION,
    RENDER_STRATEGY_VERSION,
    type
  ].join(":"));
  const descriptor = getVisualCacheDescriptor(type);
  const cacheDirectory = getVisualCacheDirectory(type);

  return {
    type,
    key,
    sourcePath: normalizedSourcePath,
    sourcePathHash,
    fileSize: sourceMetadata.fileSize,
    modifiedMs: sourceMetadata.modifiedMs,
    cacheVersion: CACHE_VERSION,
    renderStrategyVersion: RENDER_STRATEGY_VERSION,
    imagePath: path.join(cacheDirectory, `${key}${descriptor.extension}`),
    metadataPath: path.join(cacheDirectory, `${key}${descriptor.extension}.json`)
  };
};

export const createVisualCacheEntry = async (
  sourcePath: string,
  type: VisualCacheType
): Promise<VisualCacheEntry> => {
  const normalizedSourcePath = path.resolve(sourcePath);
  const sourceStat = await fs.stat(normalizedSourcePath);
  if (!sourceStat.isFile()) {
    throw new Error("视觉缓存源路径不是文件。");
  }

  return createVisualCacheEntryFromSourceMetadata(normalizedSourcePath, type, {
    fileSize: sourceStat.size,
    modifiedMs: sourceStat.mtimeMs
  });
};

const readVisualCacheMetadata = async (metadataPath: string): Promise<VisualCacheMetadata | null> => {
  try {
    return JSON.parse(await fs.readFile(metadataPath, "utf8")) as VisualCacheMetadata;
  } catch {
    return null;
  }
};

export const isVisualCacheEntryValid = async (entry: VisualCacheEntry) => {
  const metadata = await readVisualCacheMetadata(entry.metadataPath);
  if (
    !metadata
    || metadata.type !== entry.type
    || metadata.key !== entry.key
    || metadata.sourcePath !== entry.sourcePath
    || metadata.sourcePathHash !== entry.sourcePathHash
    || metadata.fileSize !== entry.fileSize
    || metadata.modifiedMs !== entry.modifiedMs
    || metadata.cacheVersion !== entry.cacheVersion
    || metadata.renderStrategyVersion !== entry.renderStrategyVersion
  ) {
    return false;
  }

  try {
    await fs.access(entry.imagePath);
    return true;
  } catch {
    return false;
  }
};

const atomicWriteFile = async (filePath: string, data: string | Buffer) => {
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, data);
  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST" || code === "EPERM") {
      await fs.rm(filePath, { force: true });
      await fs.rename(tempPath, filePath);
      return;
    }
    throw error;
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
};

export const writeVisualCacheEntry = async (
  entry: VisualCacheEntry,
  imageBuffer: Buffer,
  mimeType: VisualImageMimeType
) => {
  await fs.mkdir(path.dirname(entry.imagePath), { recursive: true });
  await atomicWriteFile(entry.imagePath, imageBuffer);
  const metadata: VisualCacheMetadata = {
    type: entry.type,
    key: entry.key,
    sourcePath: entry.sourcePath,
    sourcePathHash: entry.sourcePathHash,
    fileSize: entry.fileSize,
    modifiedMs: entry.modifiedMs,
    cacheVersion: entry.cacheVersion,
    renderStrategyVersion: entry.renderStrategyVersion,
    mimeType,
    generatedAt: new Date().toISOString()
  };
  await atomicWriteFile(entry.metadataPath, JSON.stringify(metadata, null, 2));
};

export const detectVisualImageMimeType = (buffer: Buffer): VisualImageMimeType => {
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer.subarray(1, 4).toString("ascii") === "PNG"
  ) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  throw new Error("缓存图像内容不是受支持的 JPEG 或 PNG 编码。");
};

export const readVisualCacheImage = async (imagePath: string): Promise<VisualCacheImage> => {
  const buffer = await fs.readFile(imagePath);
  if (buffer.length === 0) {
    throw new Error("缓存图像为空。");
  }
  return {
    buffer,
    mimeType: detectVisualImageMimeType(buffer)
  };
};

const listMetadataPaths = async (type: VisualCacheType) => {
  const cacheDirectory = getVisualCacheDirectory(type);
  try {
    const entries = await fs.readdir(cacheDirectory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(`${getVisualCacheDescriptor(type).extension}.json`))
      .map((entry) => path.join(cacheDirectory, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const deleteEntryFiles = async (metadataPath: string) => {
  const imagePath = metadataPath.slice(0, -".json".length);
  await Promise.all([
    fs.rm(imagePath, { force: true }).catch(() => undefined),
    fs.rm(metadataPath, { force: true }).catch(() => undefined)
  ]);
};

export const deleteVisualCacheImage = async (
  imagePath: string,
  type: VisualCacheType
) => {
  const descriptor = getVisualCacheDescriptor(type);
  const cacheDirectory = getVisualCacheDirectory(type);
  const normalizedImagePath = path.resolve(imagePath);
  if (
    !isPathInsideDirectory(normalizedImagePath, cacheDirectory)
    || !normalizedImagePath.endsWith(descriptor.extension)
  ) {
    throw new Error(`拒绝删除不属于 ${type} 的缓存路径。`);
  }

  await Promise.all([
    fs.rm(normalizedImagePath, { force: true }),
    fs.rm(`${normalizedImagePath}.json`, { force: true })
  ]);
};

export const deleteVisualCachesForImagesByType = async (
  sourcePaths: string[],
  type: VisualCacheType
) => {
  const normalizedSourcePaths = new Set(sourcePaths.map(normalizedPathForKey));
  if (normalizedSourcePaths.size === 0) {
    return 0;
  }

  const metadataPaths = await listMetadataPaths(type);
  let deletedCount = 0;
  await Promise.all(metadataPaths.map(async (metadataPath) => {
    const metadata = await readVisualCacheMetadata(metadataPath);
    if (metadata && normalizedSourcePaths.has(normalizedPathForKey(metadata.sourcePath))) {
      await deleteEntryFiles(metadataPath);
      deletedCount += 1;
    }
  }));
  return deletedCount;
};

export const deleteVisualCachesForImages = async (sourcePaths: string[]) => {
  if (sourcePaths.length === 0) {
    return;
  }

  await Promise.all(
    (Object.keys(cacheDescriptors) as VisualCacheType[])
      .map((type) => deleteVisualCachesForImagesByType(sourcePaths, type))
  );
};

export const deleteVisualCachesForDirectory = async (directoryPath: string) => {
  await Promise.all(
    (Object.keys(cacheDescriptors) as VisualCacheType[]).map(async (type) => {
      const metadataPaths = await listMetadataPaths(type);
      await Promise.all(metadataPaths.map(async (metadataPath) => {
        const metadata = await readVisualCacheMetadata(metadataPath);
        if (metadata && isPathInsideDirectory(metadata.sourcePath, directoryPath)) {
          await deleteEntryFiles(metadataPath);
        }
      }));
    })
  );
};
