import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";

export const getThumbnailSourceKey = (item: ComputerSearchItem) => JSON.stringify([
  item.id, item.volumeId, item.fileReference, item.path, item.sizeBytes,
  item.createdUtcTicks, item.modifiedUtcTicks, item.attributes, item.isDirectory,
  item.extension, item.canThumbnail, item.canShellPreview
]);

// Retain only locally decoded thumbnail pixels; an old authorization URL is never
// reused to read a source after its short-lived lease has ended.
export async function loadThumbnailImage(url: string, signal: AbortSignal): Promise<HTMLCanvasElement> {
  signal.throwIfAborted();
  const image = new Image();
  const abort = () => { image.src = ""; };
  signal.addEventListener("abort", abort, { once: true });
  try {
    image.src = url;
    await image.decode();
    signal.throwIfAborted();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(512, Math.max(image.naturalWidth, image.naturalHeight));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("thumbnail-canvas-unavailable");
    const crop = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2,
      crop, crop, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { signal.removeEventListener("abort", abort); image.src = ""; }
}
