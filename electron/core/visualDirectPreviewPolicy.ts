import type { DirectSourcePreviewFacts } from "../../src/shared/visualRenderTypes";
const directSourcePreviewExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const maximumDirectPreviewEdge = 4096;
const maximumDirectPreviewPixels = 16_000_000;
const maximumDirectPreviewBytes = 20 * 1024 * 1024;

export const shouldUseDirectStaticSourceForPreview = ({
  extension,
  fileSize,
  width,
  height
}: DirectSourcePreviewFacts) => (
  directSourcePreviewExtensions.has(extension.toLowerCase())
  && width > 0
  && height > 0
  && Math.max(width, height) <= maximumDirectPreviewEdge
  && width * height <= maximumDirectPreviewPixels
  && fileSize <= maximumDirectPreviewBytes
);
