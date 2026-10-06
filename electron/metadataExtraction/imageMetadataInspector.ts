import path from "node:path";
import sharp from "sharp";
import { inspectAnimationFact } from "../animationFactInspector";
import { analyzeVisualProperties } from "../visualPropertyAnalyzer";
import type { VisualPropertyVector } from "../visualPropertyTypes";
import { maximumVisualInputPixels, readSafeSvg, readVisualSourceDimensions, sharpSourceExtensions } from "../visualSourceDimensions";

export interface ImageMetadataObservation {
  width: number;
  height: number;
  isAnimated: boolean | null;
  properties: VisualPropertyVector | null;
}

// Run inside the isolated, timed content worker. No derived images, persistence or filesystem discovery.
// Unknown animation/color remains unknown; multipage TIFF is not classified as animation.
export const inspectImageMetadata = async (filePath: string, signal: AbortSignal): Promise<ImageMetadataObservation | null> => {
  signal.throwIfAborted();
  const dimensions = await readVisualSourceDimensions(filePath);
  signal.throwIfAborted();
  if (!dimensions) return null;
  const extension = path.extname(filePath).toLowerCase();
  let isAnimated: boolean | null = null;
  if ([".jpg", ".jpeg", ".tif", ".tiff", ".bmp"].includes(extension)) isAnimated = false;
  else if ([".png", ".gif", ".webp"].includes(extension)) {
    try { isAnimated = await inspectAnimationFact(filePath); } catch { /* Keep an unavailable fact unknown. */ }
  }
  signal.throwIfAborted();
  let properties: VisualPropertyVector | null = null;
  if (sharpSourceExtensions.has(extension)) {
    try {
      const input = extension === ".svg" ? await readSafeSvg(filePath) : filePath;
      const { data, info } = await sharp(input, { animated: false, limitInputPixels: maximumVisualInputPixels, failOn: "error" })
        .rotate().resize({ width: 300, height: 300, fit: "inside", withoutEnlargement: true })
        .toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      signal.throwIfAborted();
      properties = analyzeVisualProperties({ data, width: info.width, height: info.height });
    } catch { signal.throwIfAborted(); }
  }
  signal.throwIfAborted();
  return { ...dimensions, isAnimated, properties };
};
