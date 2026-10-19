import path from "node:path";
import sharp, { type Sharp } from "sharp";
import { readCdrFlattenedPreview } from "../../../electron/cdrRenderService";
import { renderPdfFirstPage } from "../../../electron/pdfRenderService";
import { renderPsdFlattenedPreview } from "../../../electron/psdRenderService";
import {
  assertPdfCompatibleIllustratorFile,
  renderEpsEmbeddedPreview
} from "../../../electron/vectorDocumentRenderService";
import { supportedVisualFileExtensionSet } from "../../../electron/supportedVisualFormats";
import { cropVisualContent } from "../../../electron/visualContentBoundsService";
import {
  maximumVisualInputPixels as maximumInputPixels,
  readBmpSize,
  readSafeSvg,
  readSharpSourceBuffer,
  sharpSourceExtensions,
  type ImageSize
} from "../../../electron/visualSourceDimensions";
import { requestCoreShellThumbnail } from "../../../electron/core/coreShellThumbnail";
import type { NativeVisualCacheType } from "../../../src/shared/visualRenderTypes";
import type { VisualImageMimeType } from "../../../src/shared/visualCacheTypes";
import { visualNativeExecutable, visualScratchDirectory } from "./resources";
type VisualSourceEntry = { sourcePath: string };
interface VisualRenderStrategy {
  maxWidth: number;
  maxHeight: number;
  mimeType: VisualImageMimeType;
  jpegQuality?: number;
}

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
    renderEpsEmbeddedPreview(sourcePath, strategy.maxWidth, strategy.maxHeight, (file, edge) => requestCoreShellThumbnail(file, edge, visualNativeExecutable()), visualScratchDirectory())
  ),
  ".cdr": (sourcePath) => readCdrFlattenedPreview(sourcePath)
};
const autoCropDocumentExtensions = new Set([
  ".psd",
  ".cdr"
]);

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

const createSharpPipeline = async (entry: VisualSourceEntry): Promise<Sharp> => {
  const extension = path.extname(entry.sourcePath).toLowerCase();
  const input = extension === ".svg"
    ? await readSafeSvg(entry.sourcePath)
    : await readSharpSourceBuffer(entry.sourcePath);

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
  entry: VisualSourceEntry,
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
  entry: VisualSourceEntry,
  strategy: VisualRenderStrategy
) => {
  const sourceSize = await readBmpSize(entry.sourcePath);
  const targetSize = calculateTargetSize(sourceSize, strategy);
  const targetEdge = Math.max(targetSize.width, targetSize.height);
  const png = await requestCoreShellThumbnail(entry.sourcePath, targetEdge, visualNativeExecutable());
  return strategy.mimeType === "image/jpeg"
    ? sharp(png).flatten({ background: "#000000" }).jpeg({ quality: strategy.jpegQuality ?? 90 }).toBuffer() : png;
};

const renderSourceImage = async (
  entry: VisualSourceEntry,
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

export const decodeVisualSource = async (sourcePath: string, type: NativeVisualCacheType) => {
  if (!Object.hasOwn(renderStrategies, type)) throw new Error("core-visual-invalid-type");
  const strategy = renderStrategies[type];
  if (!strategy) throw new Error("core-visual-invalid-type");
  return { buffer: await renderSourceImage({ sourcePath }, strategy), mimeType: strategy.mimeType };
};
