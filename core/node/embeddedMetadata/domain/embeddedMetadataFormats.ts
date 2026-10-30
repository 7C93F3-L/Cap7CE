import path from "node:path";
export const standardMetadataExtensions = new Set([
  ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".nef", ".dng", ".cr2", ".heic", ".heif", ".avif"
]);
export const xmpContainerExtensions = new Set([".psd", ".psb", ".pdf", ".ai"]);
const supportedEmbeddedMetadataExtensions = new Set([
  ...standardMetadataExtensions,
  ...xmpContainerExtensions,
  ".mp4", ".ttf", ".otf"
]);

export const supportsEmbeddedMetadataExtraction = (filePathOrExtension: string) => {
  const value = filePathOrExtension.trim().toLowerCase();
  const extension = value.startsWith(".") && !value.includes("\\") && !value.includes("/")
    ? value
    : path.extname(value);
  return supportedEmbeddedMetadataExtensions.has(extension);
};
