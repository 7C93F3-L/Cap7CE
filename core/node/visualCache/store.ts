import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { CACHE_VERSION, RENDER_STRATEGY_VERSION, SHELL_THUMBNAIL_POLICY_VERSION } from "./contracts/versioning";
import { createVisualCachePaths, normalizedPathForKey, formalVisualCacheTypes, formalThumbnailCacheTypes, skimVisualCacheTypes } from "./contracts/visualCachePaths";
import type { VisualCacheType, VisualCacheEntry, VisualCacheMetadata, VisualCacheSourceMetadata, VisualCacheRenderSource, VisualCacheImage, VisualImageMimeType, VisualCacheStats } from "../../../core/shared/visualCacheTypes";
import { detectVisualImageMimeType } from "./contracts/visualCacheImage";
import { maximumCacheImageBytes } from "./contracts/visualCacheFrames";
import { createVisualCachePublications } from "./publication";

export const createVisualCacheStore = (root: string) => {
  const { getVisualCacheDescriptor, getVisualCacheDirectory, getVisualCacheMetadataDirectory, getVisualCacheDirectories, isCap7CECachePath, isPathInsideDirectory } = createVisualCachePaths(root);
  const { visualCacheEpoch, publishVisualCache, clearVisualCachePublications } = createVisualCachePublications();
  const allVisualCacheTypes = [...formalVisualCacheTypes, ...skimVisualCacheTypes];
  const publicationOwner = crypto.randomUUID(), secret = crypto.randomBytes(32);
  const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
  const signEntry = (entry: Omit<VisualCacheEntry, "publicationToken">) => crypto.createHmac("sha256", secret)
    .update(JSON.stringify([entry.publicationOwner, entry.publicationEpoch, entry.type, entry.key, entry.sourcePath, entry.sourcePathHash,
      entry.fileSize, entry.modifiedMs, entry.cacheVersion, entry.renderStrategyVersion, entry.renderSource,
      entry.shellThumbnailPolicyVersion, entry.imagePath, entry.metadataPath])).digest("hex");
  const verifyEntry = (entry: VisualCacheEntry) => {
    if (entry.publicationOwner !== publicationOwner || entry.publicationToken !== signEntry(entry))
      throw Object.assign(new Error("Visual cache publication is obsolete or invalid."), { code: "ECANCELED" });
  };
  let visualCacheInitializationPromise: Promise<void> | null = null;
  let cacheStatsQueue: Promise<void> = Promise.resolve();
  let formalCacheStatsPromise: Promise<VisualCacheStats> | null = null;
  let skimCacheStatsPromise: Promise<VisualCacheStats> | null = null;
  const maximumConcurrentCacheStatReads = 2;
  const initializeVisualCacheDirectories = async () => {
    visualCacheInitializationPromise ??= Promise.all(
      getVisualCacheDirectories().map((cacheDirectory) => fs.mkdir(cacheDirectory, { recursive: true }))
    ).then(() => undefined);
    await visualCacheInitializationPromise;
  };

  const getVisualCacheTypeStats = async (type: VisualCacheType) => {
    const cachePath = getVisualCacheDirectory(type);
    const metadataPath = getVisualCacheMetadataDirectory(type);
    const extension = getVisualCacheDescriptor(type).extension;
    const entries = await fs.readdir(cachePath, { withFileTypes: true });
    const imageFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(extension));
    const metadataEntries = metadataPath === cachePath
      ? entries.filter((entry) => entry.isFile() && entry.name.endsWith(`${extension}.json`))
      : (await fs.readdir(metadataPath, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(`${extension}.json`));
    const filePaths = [
      ...imageFiles.map((entry) => path.join(cachePath, entry.name)),
      ...metadataEntries.map((entry) => path.join(metadataPath, entry.name))
    ];
    let nextFileIndex = 0;
    let totalBytes = 0;
    const readNextFileSize = async () => {
      while (nextFileIndex < filePaths.length) {
        const filePath = filePaths[nextFileIndex];
        nextFileIndex += 1;
        try {
          const stat = await fs.stat(filePath);
          totalBytes += stat.size;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(maximumConcurrentCacheStatReads, filePaths.length) },
        () => readNextFileSize()
      )
    );

    return {
      cacheCount: imageFiles.length,
      totalBytes,
      cachePaths: [...new Set([cachePath, metadataPath])]
    };
  };

  const getCacheStats = async (types: readonly VisualCacheType[]): Promise<VisualCacheStats> => {
    await initializeVisualCacheDirectories();
    const statsByType: VisualCacheStats[] = [];
    for (const type of types) {
      statsByType.push(await getVisualCacheTypeStats(type));
    }

    return {
      cacheCount: statsByType.reduce((sum, stats) => sum + stats.cacheCount, 0),
      totalBytes: statsByType.reduce((sum, stats) => sum + stats.totalBytes, 0),
      cachePaths: [...new Set(statsByType.flatMap((stats) => stats.cachePaths))]
    };
  };

  const enqueueCacheStats = (types: readonly VisualCacheType[]) => {
    const result = cacheStatsQueue.then(
      () => getCacheStats(types),
      () => getCacheStats(types)
    );
    cacheStatsQueue = result.then(() => undefined, () => undefined);
    return result;
  };

  const getVisualCacheStats = () => {
    formalCacheStatsPromise ??= enqueueCacheStats(formalVisualCacheTypes)
      .finally(() => { formalCacheStatsPromise = null; });
    return formalCacheStatsPromise;
  };

  const getSkimVisualCacheStats = () => {
    skimCacheStatsPromise ??= enqueueCacheStats(skimVisualCacheTypes)
      .finally(() => { skimCacheStatsPromise = null; });
    return skimCacheStatsPromise;
  };

  const clearCacheTypes = async (types: readonly VisualCacheType[]) => {
    await initializeVisualCacheDirectories();
    await clearVisualCachePublications(types, async () => {
      await Promise.all(
      types.map(async (type) => {
        const descriptor = getVisualCacheDescriptor(type);
        const directories = [...new Set([getVisualCacheDirectory(type), getVisualCacheMetadataDirectory(type)])];
        await Promise.all(directories.map(async (cachePath) => {
          const entries = await fs.readdir(cachePath, { withFileTypes: true });
          await Promise.all(entries.map(async (entry) => {
            if (entry.isFile() && (
              entry.name.endsWith(descriptor.extension)
              || entry.name.endsWith(`${descriptor.extension}.json`)
            )) {
              await fs.rm(path.join(cachePath, entry.name), { force: true });
            }
          }));
        }));
      })
      );
    });
  };

  const clearVisualCaches = async (): Promise<VisualCacheStats> => {
    await clearCacheTypes(formalVisualCacheTypes);
    return getVisualCacheStats();
  };

  const clearThumbnailVisualCaches = async (): Promise<VisualCacheStats> => {
    await clearCacheTypes(formalThumbnailCacheTypes);
    return getVisualCacheStats();
  };

  const clearSkimVisualCaches = async (): Promise<VisualCacheStats> => {
    await clearCacheTypes(skimVisualCacheTypes);
    return getSkimVisualCacheStats();
  };

  const createVisualCacheEntryFromSourceMetadata = (
    sourcePath: string,
    type: VisualCacheType,
    sourceMetadata: VisualCacheSourceMetadata
  ): VisualCacheEntry => {
    const normalizedSourcePath = path.resolve(sourcePath);
    const sourcePathHash = hash(normalizedPathForKey(normalizedSourcePath));
    const renderSource: VisualCacheRenderSource = type === "skim-shell-thumbnail"
      || type === "skim-shell-preview"
      || type === "search-shell-thumbnail"
      || type === "search-shell-preview"
      ? "shell"
      : "native";
    const shellThumbnailPolicyVersion = renderSource === "shell" ? SHELL_THUMBNAIL_POLICY_VERSION : null;
    const keyParts: Array<string | number> = [
      sourcePathHash,
      sourceMetadata.fileSize,
      sourceMetadata.modifiedMs,
      CACHE_VERSION,
      RENDER_STRATEGY_VERSION,
      type
    ];
    if (shellThumbnailPolicyVersion !== null) {
      keyParts.push(renderSource, shellThumbnailPolicyVersion);
    }
    const key = hash(keyParts.join(":"));
    const descriptor = getVisualCacheDescriptor(type);
    const cacheDirectory = getVisualCacheDirectory(type);

    const entry: Omit<VisualCacheEntry, "publicationToken"> = {
      publicationOwner,
      publicationEpoch: visualCacheEpoch(type),
      type,
      key,
      sourcePath: normalizedSourcePath,
      sourcePathHash,
      fileSize: sourceMetadata.fileSize,
      modifiedMs: sourceMetadata.modifiedMs,
      cacheVersion: CACHE_VERSION,
      renderStrategyVersion: RENDER_STRATEGY_VERSION,
      renderSource,
      shellThumbnailPolicyVersion,
      imagePath: path.join(cacheDirectory, `${key}${descriptor.extension}`),
      metadataPath: path.join(getVisualCacheMetadataDirectory(type), `${key}${descriptor.extension}.json`)
    };
    return { ...entry, publicationToken: signEntry(entry) };
  };

  const createVisualCacheEntry = async (
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

  const isVisualCacheEntryValid = async (entry: VisualCacheEntry) => {
    verifyEntry(entry);
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
      || (metadata.renderSource ?? "native") !== entry.renderSource
      || (
        entry.shellThumbnailPolicyVersion !== null
        && metadata.shellThumbnailPolicyVersion !== entry.shellThumbnailPolicyVersion
      )
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

  const writeVisualCacheEntry = (
    entry: VisualCacheEntry,
    imageBuffer: Buffer,
    mimeType: VisualImageMimeType
  ) => {
    verifyEntry(entry);
    return publishVisualCache(entry.type, entry.publicationEpoch, async () => {
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
        renderSource: entry.renderSource,
        ...(entry.shellThumbnailPolicyVersion === null
          ? {}
          : { shellThumbnailPolicyVersion: entry.shellThumbnailPolicyVersion }),
        mimeType,
        generatedAt: new Date().toISOString()
      };
      await atomicWriteFile(entry.metadataPath, JSON.stringify(metadata, null, 2));
    });
  };

  const readVisualCacheImage = async (imagePath: string): Promise<VisualCacheImage> => {
    if (!isCap7CECachePath(imagePath)) throw new Error("core-cache-path-outside-root");
    if ((await fs.stat(imagePath)).size > maximumCacheImageBytes) throw new Error("core-cache-image-too-large");
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
    const cacheDirectory = getVisualCacheMetadataDirectory(type);
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

  const deleteEntryFiles = async (metadataPath: string, type: VisualCacheType) => {
    const imagePath = path.join(
      getVisualCacheDirectory(type),
      path.basename(metadataPath).slice(0, -".json".length)
    );
    await Promise.all([
      fs.rm(imagePath, { force: true }).catch(() => undefined),
      fs.rm(metadataPath, { force: true }).catch(() => undefined)
    ]);
  };

  const deleteVisualCacheImage = async (
    imagePath: string,
    type: VisualCacheType
  ) => {
    const descriptor = getVisualCacheDescriptor(type);
    const cacheDirectory = getVisualCacheDirectory(type);
    const metadataDirectory = getVisualCacheMetadataDirectory(type);
    const normalizedImagePath = path.resolve(imagePath);
    if (
      !isPathInsideDirectory(normalizedImagePath, cacheDirectory)
      || !normalizedImagePath.endsWith(descriptor.extension)
    ) {
      throw new Error(`拒绝删除不属于 ${type} 的缓存路径。`);
    }

    await Promise.all([
      fs.rm(normalizedImagePath, { force: true }),
      fs.rm(path.join(metadataDirectory, `${path.basename(normalizedImagePath)}.json`), { force: true })
    ]);
  };

  const deleteVisualCachesForImagesByType = async (
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
        await deleteEntryFiles(metadataPath, type);
        deletedCount += 1;
      }
    }));
    return deletedCount;
  };

  const deleteVisualCachesForImages = async (sourcePaths: string[]) => {
    if (sourcePaths.length === 0) {
      return;
    }

    await Promise.all(
      allVisualCacheTypes
        .map((type) => deleteVisualCachesForImagesByType(sourcePaths, type))
    );
  };

  const deleteVisualCachesForDirectory = async (directoryPath: string) => {
    await Promise.all(
      allVisualCacheTypes.map(async (type) => {
        const metadataPaths = await listMetadataPaths(type);
        await Promise.all(metadataPaths.map(async (metadataPath) => {
          const metadata = await readVisualCacheMetadata(metadataPath);
          if (metadata && isPathInsideDirectory(metadata.sourcePath, directoryPath)) {
            await deleteEntryFiles(metadataPath, type);
          }
        }));
      })
    );
  };

  const listThumbnailCacheFiles = async () => {
    await initializeVisualCacheDirectories();
    const entries = await fs.readdir(getVisualCacheDirectory("search-thumbnail"), { withFileTypes: true });
    return entries.filter(entry => entry.isFile()).map(entry => entry.name);
  };
  return {
    listThumbnailCacheFiles, initializeVisualCacheDirectories, getVisualCacheStats, getSkimVisualCacheStats,
    clearVisualCaches, clearThumbnailVisualCaches, clearSkimVisualCaches, createVisualCacheEntryFromSourceMetadata,
    createVisualCacheEntry, isVisualCacheEntryValid, writeVisualCacheEntry, readVisualCacheImage,
    deleteVisualCacheImage, deleteVisualCachesForImagesByType, deleteVisualCachesForImages, deleteVisualCachesForDirectory
  };
};
