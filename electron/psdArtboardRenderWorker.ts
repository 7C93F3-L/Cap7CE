import { parentPort, workerData } from "node:worker_threads";
import fs from "node:fs/promises";
import { createCanvas, ImageData } from "@napi-rs/canvas";
import { initializeCanvas, readPsd } from "ag-psd";
import sharp from "sharp";
import { getReliableFirstPsdArtboardBounds } from "./psdArtboardBounds";

interface PsdArtboardWorkerData {
  sourcePath: string;
  maximumPsdPixels: number;
}

initializeCanvas(
  createCanvas as unknown as (width: number, height: number) => HTMLCanvasElement,
  (width, height) => new ImageData(width, height) as unknown as globalThis.ImageData
);

const parseOptions = {
  skipLayerImageData: true,
  skipLinkedFilesData: true,
  skipThumbnail: true,
  throwForMissingFeatures: false,
  logMissingFeatures: false,
  useImageData: true
} as const;

const run = async () => {
  const { sourcePath, maximumPsdPixels } = workerData as PsdArtboardWorkerData;
  const input = await fs.readFile(sourcePath);
  const structure = readPsd(input, {
    ...parseOptions,
    skipCompositeImageData: true
  });
  const bounds = getReliableFirstPsdArtboardBounds(structure);
  if (!bounds) {
    parentPort?.postMessage({ type: "fallback" });
    return;
  }
  if (structure.width * structure.height > maximumPsdPixels) {
    throw new Error(`PSD 合成图超过安全像素上限 ${maximumPsdPixels}。`);
  }

  const psd = readPsd(input, {
    ...parseOptions,
    skipCompositeImageData: false
  });
  const imageData = psd.imageData;
  if (
    !imageData
    || imageData.width !== structure.width
    || imageData.height !== structure.height
  ) {
    throw new Error("PSD 不包含可用于画板裁剪的合成预览图。");
  }

  const rawBuffer = Buffer.from(
    imageData.data.buffer,
    imageData.data.byteOffset,
    imageData.data.byteLength
  );
  const output = await sharp(rawBuffer, {
    raw: {
      width: imageData.width,
      height: imageData.height,
      channels: 4
    }
  })
    .extract(bounds)
    .toColourspace("srgb")
    .png()
    .toBuffer();
  parentPort?.postMessage({
    type: "rendered",
    buffer: output,
    bounds
  });
};

void run().catch((error) => {
  parentPort?.postMessage({
    type: "error",
    message: error instanceof Error ? error.message : "PSD 第一个画板渲染失败。"
  });
});
