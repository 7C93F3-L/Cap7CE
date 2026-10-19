import type { VisualImageMimeType } from "../../src/shared/visualCacheTypes";

export const detectVisualImageMimeType = (buffer: Buffer): VisualImageMimeType => {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer.subarray(1, 4).toString("ascii") === "PNG") return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  throw new Error("缓存图像内容不是受支持的 JPEG 或 PNG 编码。");
};
