import fs from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";

const maximumPdfBytes = 256 * 1024 * 1024;
const maximumRenderedPixels = 16_000_000;
const maximumCanvasAreaBytes = 64 * 1024 * 1024;

type PdfJsModule = typeof import("pdfjs-dist");

const importEsmModule = new Function(
  "specifier",
  "return import(specifier);"
) as (specifier: string) => Promise<PdfJsModule>;

let pdfJsPromise: Promise<PdfJsModule> | null = null;

const loadPdfJs = () => (
  pdfJsPromise ??= importEsmModule("pdfjs-dist/legacy/build/pdf.mjs")
);

export const renderPdfFirstPage = async (
  sourcePath: string,
  maxWidth: number,
  maxHeight: number
) => {
  const stat = await fs.stat(sourcePath);
  if (stat.size > maximumPdfBytes) {
    throw new Error(`PDF 文件超过安全大小上限 ${maximumPdfBytes} 字节。`);
  }

  const { getDocument } = await loadPdfJs();
  const loadingTask = getDocument({
    data: new Uint8Array(await fs.readFile(sourcePath)),
    disableAutoFetch: true,
    disableRange: true,
    disableStream: true,
    enableXfa: false,
    isEvalSupported: false,
    maxImageSize: -1,
    canvasMaxAreaInBytes: maximumCanvasAreaBytes,
    stopAtErrors: true,
    useSystemFonts: true,
    useWorkerFetch: false
  });
  const document = await loadingTask.promise;

  try {
    if (document.numPages < 1) {
      throw new Error("PDF 不包含可渲染页面。");
    }

    const page = await document.getPage(1);
    const sourceViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      maxWidth / sourceViewport.width,
      maxHeight / sourceViewport.height
    );
    const viewport = page.getViewport({ scale: Math.max(scale, 0.01) });
    const width = Math.max(1, Math.ceil(viewport.width));
    const height = Math.max(1, Math.ceil(viewport.height));
    if (width * height > maximumRenderedPixels) {
      throw new Error(`PDF 首页面积超过安全像素上限 ${maximumRenderedPixels}。`);
    }

    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport
    }).promise;
    page.cleanup();

    return Buffer.from(await canvas.encode("png"));
  } finally {
    await document.destroy();
  }
};
