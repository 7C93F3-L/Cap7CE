import { nativeImage, type NativeImage } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { readCdrFlattenedPreview } from "./cdrRenderService";
import { renderPdfFirstPage } from "./pdfRenderService";
import { renderPsdFlattenedPreview } from "./psdRenderService";
import {
  assertPdfCompatibleIllustratorFile,
  renderEpsEmbeddedPreview
} from "./vectorDocumentRenderService";
import { supportedVisualFileExtensionSet } from "./supportedVisualFormats";
import { cropVisualContent } from "./visualContentBoundsService";
import {
  createVisualCacheEntry,
  initializeVisualCacheDirectories,
  isVisualCacheEntryValid,
  readVisualCacheImage,
  writeVisualCacheEntry,
  type VisualCacheEntry,
  type VisualCacheType,
  type VisualImageMimeType
} from "./visualCacheService";

interface VisualRenderStrategy {
  maxWidth: number;
  maxHeight: number;
  mimeType: VisualImageMimeType;
  jpegQuality?: number;
}

interface ImageSize {
  width: number;
  height: number;
}

type NativeVisualCacheType = Exclude<VisualCacheType, "skim-shell-thumbnail">;

const sharpSourceExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".tif",
  ".tiff",
  ".gif",
  ".svg"
]);

const renderStrategies: Record<NativeVisualCacheType, VisualRenderStrategy> = {
  "search-thumbnail": {
    maxWidth: 300,
    maxHeight: 300,
    mimeType: "image/png"
  },
  "model-input-image": {
    maxWidth: 1536,
    maxHeight: 1536,
    mimeType: "image/jpeg",
    jpegQuality: 90
  },
  "preview-image": {
    maxWidth: 2560,
    maxHeight: 2560,
    mimeType: "image/png"
  },
  "skim-thumbnail": {
    maxWidth: 300,
    maxHeight: 300,
    mimeType: "image/png"
  },
  "skim-preview": {
    maxWidth: 2560,
    maxHeight: 2560,
    mimeType: "image/png"
  }
};

const pendingRenders = new Map<string, Promise<string>>();
const maximumInputPixels = 150_000_000;
const maximumBmpPixels = 50_000_000;
const maximumSvgBytes = 20 * 1024 * 1024;
const documentSourceRenderers: Record<
  string,
  (sourcePath: string, strategy: VisualRenderStrategy) => Promise<Buffer>
> = {
  ".pdf": (sourcePath, strategy) => (
    renderPdfFirstPage(sourcePath, strategy.maxWidth, strategy.maxHeight)
  ),
  ".psd": (sourcePath) => (
    renderPsdFlattenedPreview(sourcePath)
  ),
  ".ai": async (sourcePath, strategy) => {
    await assertPdfCompatibleIllustratorFile(sourcePath);
    return renderPdfFirstPage(sourcePath, strategy.maxWidth, strategy.maxHeight);
  },
  ".eps": (sourcePath, strategy) => (
    renderEpsEmbeddedPreview(sourcePath, strategy.maxWidth, strategy.maxHeight)
  ),
  ".cdr": (sourcePath) => readCdrFlattenedPreview(sourcePath)
};
const autoCropDocumentExtensions = new Set([
  ".psd",
  ".cdr"
]);

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

  if (extension === ".png") {
    return isAnimatedPngSource(sourcePath);
  }

  if (extension !== ".webp") {
    return false;
  }

  try {
    const metadata = await sharp(sourcePath, {
      limitInputPixels: maximumInputPixels
    }).metadata();
    return (metadata.pages ?? 1) > 1;
  } catch {
    return false;
  }
};

const configureSharpCache = () => {
  sharp.cache({
    memory: 64,
    files: 20,
    items: 100
  });
};

export const releaseVisualRenderFileHandles = () => {
  sharp.cache(false);
  configureSharpCache();
};

configureSharpCache();
sharp.concurrency(2);

const calculateTargetSize = (sourceSize: ImageSize, strategy: VisualRenderStrategy): ImageSize => {
  const scale = Math.min(
    1,
    strategy.maxWidth / sourceSize.width,
    strategy.maxHeight / sourceSize.height
  );
  return {
    width: Math.max(1, Math.round(sourceSize.width * scale)),
    height: Math.max(1, Math.round(sourceSize.height * scale))
  };
};

const readBmpSize = async (filePath: string): Promise<ImageSize> => {
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
    if (width <= 0 || height <= 0) {
      throw new Error("BMP 尺寸无效。");
    }
    if (width * height > maximumBmpPixels) {
      throw new Error(`BMP 像素数量超过安全上限 ${maximumBmpPixels}。`);
    }
    return { width, height };
  } finally {
    await handle.close();
  }
};

const stripSvgDoctype = (svg: string) => (
  svg.replace(/<!DOCTYPE[^>]*>/gi, "")
);

const assertSafeSvgReference = (value: string, kind: string) => {
  const normalized = value.trim();
  if (normalized && !normalized.startsWith("#")) {
    throw new Error(`SVG 包含被禁止的外部 ${kind} 引用。`);
  }
};

const readSafeSvg = async (filePath: string) => {
  const stat = await fs.stat(filePath);
  if (stat.size > maximumSvgBytes) {
    throw new Error(`SVG 文件超过安全大小上限 ${maximumSvgBytes} 字节。`);
  }

  const original = await fs.readFile(filePath, "utf8");
  if (/<!ENTITY\b/i.test(original)) {
    throw new Error("SVG 包含被禁止的 XML 实体。");
  }
  if (/<\?(?:xml-)?stylesheet\b/i.test(original)) {
    throw new Error("SVG 包含被禁止的外部样式表。");
  }
  if (/<\s*(?:[a-z0-9_-]+:)?(?:script|foreignObject|iframe|object|embed|audio|video)\b/i.test(original)) {
    throw new Error("SVG 包含被禁止的可执行或嵌入元素。");
  }
  if (/\son[a-z0-9:_-]+\s*=/i.test(original)) {
    throw new Error("SVG 包含被禁止的事件处理器。");
  }
  if (/@import\b/i.test(original)) {
    throw new Error("SVG 包含被禁止的 CSS 外部导入。");
  }

  for (const match of original.matchAll(/\b(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gi)) {
    assertSafeSvgReference(match[2], "href");
  }
  for (const match of original.matchAll(/\burl\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    assertSafeSvgReference(match[2], "CSS url");
  }

  return Buffer.from(stripSvgDoctype(original), "utf8");
};

const createSharpPipeline = async (entry: VisualCacheEntry): Promise<sharp.Sharp> => {
  const extension = path.extname(entry.sourcePath).toLowerCase();
  const input = extension === ".svg"
    ? await readSafeSvg(entry.sourcePath)
    : entry.sourcePath;

  return sharp(input, {
    page: 0,
    pages: 1,
    animated: false,
    autoOrient: true,
    failOn: "warning",
    limitInputPixels: maximumInputPixels,
    sequentialRead: true
  });
};

const encodeRenderedBuffer = async (
  buffer: Buffer,
  strategy: VisualRenderStrategy
) => {
  let output = sharp(buffer, {
    limitInputPixels: maximumInputPixels,
    sequentialRead: true
  })
    .resize({
      width: strategy.maxWidth,
      height: strategy.maxHeight,
      fit: "inside",
      withoutEnlargement: true
    })
    .toColourspace("srgb");

  if (strategy.mimeType === "image/jpeg") {
    output = output
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: strategy.jpegQuality ?? 90 });
  } else {
    output = output.png();
  }

  return output.toBuffer();
};

const renderWithSharp = async (
  entry: VisualCacheEntry,
  strategy: VisualRenderStrategy
) => {
  const pipeline = await createSharpPipeline(entry);
  const metadata = await pipeline.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("无法读取源文件尺寸。");
  }

  let output = pipeline
    .resize({
      width: strategy.maxWidth,
      height: strategy.maxHeight,
      fit: "inside",
      withoutEnlargement: true
    })
    .toColourspace("srgb");

  if (strategy.mimeType === "image/jpeg") {
    output = output
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: strategy.jpegQuality ?? 90 });
  } else {
    output = output.png();
  }

  return output.toBuffer();
};

const renderBmp = async (
  entry: VisualCacheEntry,
  strategy: VisualRenderStrategy
) => {
  const sourceSize = await readBmpSize(entry.sourcePath);
  const targetSize = calculateTargetSize(sourceSize, strategy);
  const targetEdge = Math.max(targetSize.width, targetSize.height);
  const image = await nativeImage.createThumbnailFromPath(entry.sourcePath, {
    width: targetEdge,
    height: targetEdge
  });
  if (image.isEmpty()) {
    throw new Error("Windows 无法解码 BMP 文件。");
  }
  return encodeNativeImage(image, strategy);
};

const encodeNativeImage = (image: NativeImage, strategy: VisualRenderStrategy) => {
  if (strategy.mimeType === "image/jpeg") {
    return image.toJPEG(strategy.jpegQuality ?? 90);
  }
  return image.toPNG();
};

const renderSourceImage = async (
  entry: VisualCacheEntry,
  strategy: VisualRenderStrategy
) => {
  const extension = path.extname(entry.sourcePath).toLowerCase();
  if (!supportedVisualFileExtensionSet.has(extension)) {
    throw new Error(`当前视觉渲染不支持 ${extension || "未知格式"}。`);
  }
  if (extension === ".bmp") {
    return renderBmp(entry, strategy);
  }
  const documentRenderer = documentSourceRenderers[extension];
  if (documentRenderer) {
    const renderedBuffer = await documentRenderer(entry.sourcePath, strategy);
    const preparedBuffer = autoCropDocumentExtensions.has(extension)
      ? (await cropVisualContent(renderedBuffer)).buffer
      : renderedBuffer;
    return encodeRenderedBuffer(
      preparedBuffer,
      strategy
    );
  }
  if (sharpSourceExtensions.has(extension)) {
    return renderWithSharp(entry, strategy);
  }
  throw new Error(`当前视觉渲染不支持 ${extension || "未知格式"}。`);
};

const renderVisualCache = async (entry: VisualCacheEntry) => {
  if (entry.type === "skim-shell-thumbnail") {
    throw new Error("Shell 缩略图必须使用独立 Provider。");
  }
  if (await isVisualCacheEntryValid(entry)) {
    return entry.imagePath;
  }

  try {
    const strategy = renderStrategies[entry.type];
    const imageBuffer = await renderSourceImage(entry, strategy);
    if (imageBuffer.length === 0) {
      throw new Error("渲染结果为空。");
    }

    await writeVisualCacheEntry(entry, imageBuffer, strategy.mimeType);
    return entry.imagePath;
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知渲染错误";
    throw new Error(`${entry.type} 生成失败：${message}`);
  }
};

export const ensureVisualCachePath = async (sourcePath: string, type: VisualCacheType) => {
  await initializeVisualCacheDirectories();
  const entry = await createVisualCacheEntry(sourcePath, type);
  const pendingKey = `${type}:${entry.key}`;
  const pending = pendingRenders.get(pendingKey);
  if (pending) {
    return pending;
  }

  const render = renderVisualCache(entry).finally(() => {
    pendingRenders.delete(pendingKey);
  });
  pendingRenders.set(pendingKey, render);
  return render;
};

export const ensureSearchThumbnailPath = (sourcePath: string) => (
  ensureVisualCachePath(sourcePath, "search-thumbnail")
);

export const ensureModelInputImagePath = (sourcePath: string) => (
  ensureVisualCachePath(sourcePath, "model-input-image")
);

export const ensurePreviewImagePath = (sourcePath: string) => (
  ensureVisualCachePath(sourcePath, "preview-image")
);

export const ensureSkimThumbnailPath = (sourcePath: string) => (
  ensureVisualCachePath(sourcePath, "skim-thumbnail")
);

export const ensureSkimPreviewPath = (sourcePath: string) => (
  ensureVisualCachePath(sourcePath, "skim-preview")
);

export const loadModelInputImage = async (sourcePath: string) => {
  const imagePath = await ensureModelInputImagePath(sourcePath);
  return {
    imagePath,
    ...await readVisualCacheImage(imagePath)
  };
};
