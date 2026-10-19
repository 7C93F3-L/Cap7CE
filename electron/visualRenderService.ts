import type { VisualCacheType } from "../src/shared/visualCacheTypes";
import type { VisualPreparedPath, ImageSize, VisualRenderImage } from "../src/shared/visualRenderTypes";
import { requestVisualCacheOwner, readVisualCacheImage, releaseVisualCacheSourceHandles } from "./visualCacheService";
export { shouldUseDirectStaticSourceForPreview } from "./core/visualDirectPreviewPolicy";
export type { DirectSourcePreviewFacts } from "../src/shared/visualRenderTypes";

export const shouldUseSourceFileForPreview = (sourcePath: string) => requestVisualCacheOwner<boolean>("sourcePreview", [sourcePath]);
export const readVisualSourceDimensions = (sourcePath: string) => requestVisualCacheOwner<ImageSize | null>("sourceDimensions", [sourcePath]);
export const releaseVisualRenderFileHandles = releaseVisualCacheSourceHandles;
export const ensureVisualCachePath = async (sourcePath: string, type: VisualCacheType) =>
  (await requestVisualCacheOwner<VisualPreparedPath>("ensure", [sourcePath, type])).imagePath;
export const ensureSearchThumbnail = async (sourcePath: string) => {
  const result = await requestVisualCacheOwner<VisualPreparedPath>("ensure", [sourcePath, "search-thumbnail"]);
  return { thumbnailPath: result.imagePath, fileSize: result.fileSize, modifiedMs: result.modifiedMs };
};
export const ensureSearchThumbnailPath = (sourcePath: string) => ensureVisualCachePath(sourcePath, "search-thumbnail");
export const ensureModelInputImagePath = (sourcePath: string) => ensureVisualCachePath(sourcePath, "model-input-image");
export const ensurePreviewImagePath = (sourcePath: string) => ensureVisualCachePath(sourcePath, "preview-image");
export const ensureSkimThumbnailPath = (sourcePath: string) => ensureVisualCachePath(sourcePath, "skim-thumbnail");
export const ensureSkimPreviewPath = (sourcePath: string) => ensureVisualCachePath(sourcePath, "skim-preview");
export const loadModelInputImage = async (sourcePath: string) => {
  const imagePath = await ensureModelInputImagePath(sourcePath);
  return { imagePath, ...await readVisualCacheImage(imagePath) };
};
export const prepareTemporaryModelInputImage = async (sourcePath: string): Promise<VisualRenderImage> => {
  const image = await requestVisualCacheOwner<{ base64: string; mimeType: VisualRenderImage["mimeType"] }>("temporaryImage", [sourcePath]);
  return { buffer: Buffer.from(image.base64, "base64"), mimeType: image.mimeType };
};
