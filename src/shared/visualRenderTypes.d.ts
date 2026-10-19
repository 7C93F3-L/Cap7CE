import type { VisualCacheType, VisualImageMimeType } from "./visualCacheTypes";
export interface ImageSize { width: number; height: number }
export interface VisualPreparedPath { imagePath: string; fileSize: number; modifiedMs: number }
export interface DirectSourcePreviewFacts {
  extension: string;
  fileSize: number;
  width: number;
  height: number;
}
export type NativeVisualCacheType = Exclude<VisualCacheType, "skim-shell-thumbnail" | "skim-shell-preview" | "search-shell-thumbnail" | "search-shell-preview">;
export interface VisualRenderImage { buffer: Buffer; mimeType: VisualImageMimeType }
export type VisualDecodeTask = { operation: "decode"; sourcePath: string; type: NativeVisualCacheType }
  | { operation: "dimensions" | "sourcePreview"; sourcePath: string };
export type VisualDecodeResult = { kind: "image"; base64: string; mimeType: VisualImageMimeType }
  | { kind: "dimensions"; value: ImageSize | null }
  | { kind: "sourcePreview"; value: boolean };
