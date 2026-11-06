import { parentPort, workerData } from "node:worker_threads";
import { initializeCanvas, readPsd } from "ag-psd";
import { createCanvas, ImageData } from "@napi-rs/canvas";
import sharp from "sharp";
import { readPsdSource, assertPsdSource } from "./source";

initializeCanvas(createCanvas as unknown as (width: number, height: number) => HTMLCanvasElement,
  (width, height) => new ImageData(width, height) as unknown as globalThis.ImageData);
sharp.cache(false); sharp.concurrency(1);
const file = String(workerData.file);
async function start() {
  const source = await readPsdSource(file);
  const image = readPsd(source.input, { skipLayerImageData: true, skipLinkedFilesData: true, skipThumbnail: true,
    skipCompositeImageData: false, useImageData: true, throwForMissingFeatures: false, logMissingFeatures: false }).imageData;
  if (!image || image.width !== source.width || image.height !== source.height) throw Error("psd-preview-composite");
  const pixels = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength); source.input = Buffer.alloc(0);
  const { width, height, pages, stamp } = source; let rendering = false;
  parentPort!.on("message", async (message: { id: number; page: number }) => {
    try {
      if (rendering || !Number.isSafeInteger(message.id) || !Number.isSafeInteger(message.page) || !pages[message.page]) throw Error("psd-preview-page");
      rendering = true; await assertPsdSource(file, stamp);
      const { left, top, width: pageWidth, height: pageHeight } = pages[message.page];
      const png = await sharp(pixels, { raw: { width, height, channels: 4 } }).extract({ left, top, width: pageWidth, height: pageHeight })
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      if (png.length > 12 * 1024 * 1024) throw Error("psd-preview-output-limit");
      await assertPsdSource(file, stamp); parentPort!.postMessage({ id: message.id, type: "page", png });
    } catch (error) { parentPort!.postMessage({ id: message.id, type: "error", error: String(error) }); }
    finally { rendering = false; }
  });
  await assertPsdSource(file, stamp);
  parentPort!.postMessage({ id: 0, type: "ready", pages: pages.map(({ name, width, height }) => ({ name, width, height })) });
}
void start().catch(error => parentPort!.postMessage({ id: 0, type: "error", error: String(error) }));
