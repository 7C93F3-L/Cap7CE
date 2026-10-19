export type FormalVisualCacheType = "search-thumbnail" | "search-shell-thumbnail" | "search-shell-preview" | "model-input-image" | "preview-image";
export type SkimVisualCacheType = "skim-thumbnail" | "skim-preview" | "skim-shell-thumbnail" | "skim-shell-preview";
export type VisualCacheType = FormalVisualCacheType | SkimVisualCacheType;
export type VisualImageMimeType = "image/jpeg" | "image/png";
export type VisualCacheRenderSource = "native" | "shell";

export interface VisualCacheDescriptor {
  type: VisualCacheType;
  directoryName: string;
  metadataDirectoryName?: string;
  extension: ".capth" | ".capshth" | ".capshpr" | ".capmo" | ".cappr" | ".capskth" | ".capskpr" | ".capsksh" | ".capsksp";
}

export interface VisualCacheEntry {
  publicationEpoch: number;
  publicationOwner: string;
  publicationToken: string;
  type: VisualCacheType;
  key: string;
  sourcePath: string;
  sourcePathHash: string;
  fileSize: number;
  modifiedMs: number;
  cacheVersion: number;
  renderStrategyVersion: number;
  renderSource: VisualCacheRenderSource;
  shellThumbnailPolicyVersion: number | null;
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
  renderSource?: VisualCacheRenderSource;
  shellThumbnailPolicyVersion?: number;
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

