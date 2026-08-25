import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { supportedImageDimensionExtensions } from "./imageDimensionTypes";

export interface ImageSize {
  width: number;
  height: number;
}

export const maximumVisualInputPixels = 150_000_000;
export const sharpSourceExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".tif",
  ".tiff",
  ".gif",
  ".svg"
]);
export const supportedImageDimensionExtensionSet = new Set(supportedImageDimensionExtensions);

const maximumBmpPixels = 50_000_000;
const maximumSvgBytes = 20 * 1024 * 1024;

export const readBmpSize = async (filePath: string): Promise<ImageSize> => {
  const handle = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(54);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < 26 || header.subarray(0, 2).toString("ascii") !== "BM") {
      throw new Error("BMP 文件头无效。");
    }

    const dibHeaderSize = header.readUInt32LE(14);
    const width = dibHeaderSize === 12
      ? header.readUInt16LE(18)
      : Math.abs(header.readInt32LE(18));
    const height = dibHeaderSize === 12
      ? header.readUInt16LE(20)
      : Math.abs(header.readInt32LE(22));
    if (width <= 0 || height <= 0) throw new Error("BMP 尺寸无效。");
    if (width * height > maximumBmpPixels) {
      throw new Error(`BMP 像素数量超过安全上限 ${maximumBmpPixels}。`);
    }
    return { width, height };
  } finally {
    await handle.close();
  }
};

const stripSvgDoctype = (svg: string) => svg.replace(/<!DOCTYPE[^>]*>/gi, "");

const assertSafeSvgReference = (value: string, kind: string) => {
  const normalized = value.trim();
  if (normalized && !normalized.startsWith("#")) {
    throw new Error(`SVG 包含被禁止的外部 ${kind} 引用。`);
  }
};

export const readSafeSvg = async (filePath: string) => {
  const stat = await fs.stat(filePath);
  if (stat.size > maximumSvgBytes) {
    throw new Error(`SVG 文件超过安全大小上限 ${maximumSvgBytes} 字节。`);
  }

  const original = await fs.readFile(filePath, "utf8");
  if (/<!ENTITY\b/i.test(original)) throw new Error("SVG 包含被禁止的 XML 实体。");
  if (/<\?(?:xml-)?stylesheet\b/i.test(original)) throw new Error("SVG 包含被禁止的外部样式表。");
  if (/<\s*(?:[a-z0-9_-]+:)?(?:script|foreignObject|iframe|object|embed|audio|video)\b/i.test(original)) {
    throw new Error("SVG 包含被禁止的可执行或嵌入元素。");
  }
  if (/\son[a-z0-9:_-]+\s*=/i.test(original)) throw new Error("SVG 包含被禁止的事件处理器。");
  if (/@import\b/i.test(original)) throw new Error("SVG 包含被禁止的 CSS 外部导入。");

  for (const match of original.matchAll(/\b(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gi)) {
    assertSafeSvgReference(match[2], "href");
  }
  for (const match of original.matchAll(/\burl\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    assertSafeSvgReference(match[2], "CSS url");
  }
  return Buffer.from(stripSvgDoctype(original), "utf8");
};

export const readVisualSourceDimensions = async (sourcePath: string): Promise<ImageSize | null> => {
  const extension = path.extname(sourcePath).toLowerCase();
  if (extension === ".bmp") return readBmpSize(sourcePath);
  if (!sharpSourceExtensions.has(extension)) return null;

  const input = extension === ".svg" ? await readSafeSvg(sourcePath) : sourcePath;
  const metadata = await sharp(input, {
    animated: false,
    limitInputPixels: maximumVisualInputPixels
  }).metadata();
  const rawWidth = metadata.width ?? 0;
  const rawHeight = metadata.pageHeight ?? metadata.height ?? 0;
  if (rawWidth <= 0 || rawHeight <= 0) return null;
  const rotated = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8;
  return rotated
    ? { width: rawHeight, height: rawWidth }
    : { width: rawWidth, height: rawHeight };
};
