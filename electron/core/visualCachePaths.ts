import path from "node:path";
import type { VisualCacheType, VisualCacheDescriptor, FormalVisualCacheType, SkimVisualCacheType } from "../../src/shared/visualCacheTypes";

const cacheDescriptors: Record<VisualCacheType, VisualCacheDescriptor> = {
  "search-thumbnail": {
    type: "search-thumbnail",
    directoryName: "thumbnails",
    extension: ".capth"
  },
  "search-shell-thumbnail": {
    type: "search-shell-thumbnail",
    directoryName: path.join("search-shell-cache", "thumbnails"),
    metadataDirectoryName: path.join("search-shell-cache", "metadata"),
    extension: ".capshth"
  },
  "search-shell-preview": {
    type: "search-shell-preview",
    directoryName: path.join("search-shell-cache", "previews"),
    metadataDirectoryName: path.join("search-shell-cache", "metadata"),
    extension: ".capshpr"
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
  },
  "skim-thumbnail": {
    type: "skim-thumbnail",
    directoryName: path.join("skim-cache", "thumbnails"),
    metadataDirectoryName: path.join("skim-cache", "metadata"),
    extension: ".capskth"
  },
  "skim-preview": {
    type: "skim-preview",
    directoryName: path.join("skim-cache", "previews"),
    metadataDirectoryName: path.join("skim-cache", "metadata"),
    extension: ".capskpr"
  },
  "skim-shell-thumbnail": {
    type: "skim-shell-thumbnail",
    directoryName: path.join("skim-cache", "thumbnails"),
    metadataDirectoryName: path.join("skim-cache", "metadata"),
    extension: ".capsksh"
  },
  "skim-shell-preview": {
    type: "skim-shell-preview",
    directoryName: path.join("skim-cache", "previews"),
    metadataDirectoryName: path.join("skim-cache", "metadata"),
    extension: ".capsksp"
  }
};

export const formalVisualCacheTypes: readonly FormalVisualCacheType[] = [
  "search-thumbnail", "search-shell-thumbnail", "search-shell-preview", "model-input-image", "preview-image"
];
export const formalThumbnailCacheTypes: readonly FormalVisualCacheType[] = [
  "search-thumbnail", "search-shell-thumbnail"
];
export const skimVisualCacheTypes: readonly SkimVisualCacheType[] = [
  "skim-thumbnail", "skim-preview", "skim-shell-thumbnail", "skim-shell-preview"
];


export const normalizedPathForKey = (filePath: string) => {
  const resolvedPath = path.resolve(filePath);
  return process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
};
export const createVisualCachePaths = (root: string) => {
  let cachedVisualCacheDirectories: string[] | null = null;
  const getVisualCacheDescriptor = (type: VisualCacheType) => cacheDescriptors[type];

  const getVisualCacheDirectory = (type: VisualCacheType) => (
    path.join(root, getVisualCacheDescriptor(type).directoryName)
  );

  const getVisualCacheMetadataDirectory = (type: VisualCacheType) => {
    const descriptor = getVisualCacheDescriptor(type);
    return path.join(root, descriptor.metadataDirectoryName ?? descriptor.directoryName);
  };

  const getVisualCacheDirectories = () => (
    cachedVisualCacheDirectories ??= [...new Set(
      (Object.keys(cacheDescriptors) as VisualCacheType[])
        .flatMap((type) => [getVisualCacheDirectory(type), getVisualCacheMetadataDirectory(type)])
    )]
  );

  const isPathInsideDirectory = (filePath: string, directoryPath: string) => {
    const normalizedFilePath = normalizedPathForKey(filePath);
    const normalizedDirectoryPath = normalizedPathForKey(directoryPath);
    return normalizedFilePath === normalizedDirectoryPath
      || normalizedFilePath.startsWith(`${normalizedDirectoryPath}${path.sep}`);
  };

  const isCap7CECachePath = (filePath: string) => (
    getVisualCacheDirectories()
      .some((cacheDirectory) => isPathInsideDirectory(filePath, cacheDirectory))
  );

  return { getVisualCacheDescriptor, getVisualCacheDirectory, getVisualCacheMetadataDirectory, getVisualCacheDirectories, isCap7CECachePath, isPathInsideDirectory };
};
