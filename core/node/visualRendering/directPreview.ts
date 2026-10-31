import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { maximumVisualInputPixels as maximumInputPixels, readSharpSourceBuffer, readVisualSourceDimensions } from "../fileFacts/domain/visualSourceDimensions";
import { shouldUseDirectStaticSourceForPreview } from "./decoders/visualDirectPreviewPolicy";
const directSourcePreviewExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const maximumPngChunksToInspect = 512;
const isAnimatedPngSource = async (sourcePath: string): Promise<boolean> => {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(sourcePath, "r");
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < pngSignature.length + 12) return false;

    const signature = Buffer.alloc(pngSignature.length);
    const signatureRead = await handle.read(signature, 0, signature.length, 0);
    if (signatureRead.bytesRead !== signature.length || !signature.equals(pngSignature)) return false;

    let offset = pngSignature.length;
    for (let chunkIndex = 0; chunkIndex < maximumPngChunksToInspect && offset + 12 <= stat.size; chunkIndex += 1) {
      const header = Buffer.alloc(8);
      const headerRead = await handle.read(header, 0, header.length, offset);
      if (headerRead.bytesRead !== header.length) return false;
      const dataLength = header.readUInt32BE(0);
      const chunkType = header.toString("ascii", 4, 8);
      const chunkEnd = offset + 12 + dataLength;
      if (chunkEnd > stat.size) return false;

      if (chunkType === "acTL") {
        if (dataLength !== 8) return false;
        const animationControl = Buffer.alloc(8);
        const controlRead = await handle.read(animationControl, 0, animationControl.length, offset + 8);
        return controlRead.bytesRead === animationControl.length && animationControl.readUInt32BE(0) > 1;
      }
      if (chunkType === "IDAT" || chunkType === "IEND") return false;
      offset = chunkEnd;
    }
    return false;
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => undefined);
  }
};

export const shouldUseSourceFileForPreview = async (
  sourcePath: string
): Promise<boolean> => {
  const extension = path.extname(sourcePath).toLowerCase();

  if (extension === ".gif") {
    return true;
  }

  if (!directSourcePreviewExtensions.has(extension)) {
    return false;
  }

  if (extension === ".png" && await isAnimatedPngSource(sourcePath)) {
    return true;
  }

  try {
    if (extension === ".webp") {
      const metadata = await sharp(await readSharpSourceBuffer(sourcePath), {
        limitInputPixels: maximumInputPixels
      }).metadata();
      if ((metadata.pages ?? 1) > 1) {
        return true;
      }
    }

    const [sourceStat, sourceSize] = await Promise.all([
      fs.stat(sourcePath),
      readVisualSourceDimensions(sourcePath)
    ]);
    if (!sourceStat.isFile() || !sourceSize) {
      return false;
    }
    return shouldUseDirectStaticSourceForPreview({
      extension,
      fileSize: sourceStat.size,
      width: sourceSize.width,
      height: sourceSize.height
    });
  } catch {
    return false;
  }
};
