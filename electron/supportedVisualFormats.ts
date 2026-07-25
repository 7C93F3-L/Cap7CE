export const supportedVisualFileExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".gif",
  ".svg",
  ".pdf",
  ".psd",
  ".ai",
  ".eps",
  ".cdr"
] as const;

export const supportedVisualFileExtensionSet: ReadonlySet<string> = new Set(
  supportedVisualFileExtensions
);
