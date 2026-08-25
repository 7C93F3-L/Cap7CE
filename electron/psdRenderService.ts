import fs from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { createCanvas, ImageData } from "@napi-rs/canvas";
import { initializeCanvas, readPsd } from "ag-psd";
import sharp from "sharp";
import {
  getReliableFirstPsdArtboardBounds,
  type PsdArtboardBounds
} from "./psdArtboardBounds";

interface PsdThumbnail {
  resourceId: number;
  jpeg: Buffer;
}

const maximumCompositeFileBytes = 128 * 1024 * 1024;
const maximumArtboardWorkerFileBytes = 512 * 1024 * 1024;
const maximumPsdPixels = 50_000_000;
const thumbnailResourceIds = new Set([1033, 1036]);

initializeCanvas(
  createCanvas as unknown as (width: number, height: number) => HTMLCanvasElement,
  (width, height) => new ImageData(width, height) as unknown as globalThis.ImageData
);

const readExact = async (
  handle: fs.FileHandle,
  position: number,
  length: number
) => {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    throw new Error("PSD 文件意外结束。");
  }
  return buffer;
};

const readEmbeddedThumbnail = async (sourcePath: string): Promise<PsdThumbnail | null> => {
  const handle = await fs.open(sourcePath, "r");
  try {
    const header = await readExact(handle, 0, 30);
    if (
      header.subarray(0, 4).toString("ascii") !== "8BPS"
      || header.readUInt16BE(4) !== 1
    ) {
      throw new Error("PSD 文件头无效或不是标准 PSD。");
    }

    const colorDataLength = header.readUInt32BE(26);
    const resourcesLengthOffset = 30 + colorDataLength;
    const resourcesLength = (
      await readExact(handle, resourcesLengthOffset, 4)
    ).readUInt32BE(0);
    let offset = resourcesLengthOffset + 4;
    const resourcesEnd = offset + resourcesLength;

    while (offset + 11 <= resourcesEnd) {
      const blockHeader = await readExact(handle, offset, 7);
      const signature = blockHeader.subarray(0, 4).toString("ascii");
      if (signature !== "8BIM" && signature !== "MeSa") {
        throw new Error("PSD 图像资源区无效。");
      }

      const resourceId = blockHeader.readUInt16BE(4);
      const nameLength = blockHeader.readUInt8(6);
      const nameFieldLength = (1 + nameLength + 1) & ~1;
      const sizeOffset = offset + 6 + nameFieldLength;
      const dataLength = (
        await readExact(handle, sizeOffset, 4)
      ).readUInt32BE(0);
      const dataOffset = sizeOffset + 4;
      const nextOffset = dataOffset + dataLength + (dataLength & 1);
      if (nextOffset > resourcesEnd) {
        throw new Error("PSD 图像资源长度无效。");
      }

      if (thumbnailResourceIds.has(resourceId) && dataLength > 28) {
        const thumbnailHeader = await readExact(handle, dataOffset, 28);
        const format = thumbnailHeader.readUInt32BE(0);
        const compressedSize = thumbnailHeader.readUInt32BE(20);
        const availableBytes = dataLength - 28;
        if (format === 1 && compressedSize > 0 && compressedSize <= availableBytes) {
          return {
            resourceId,
            jpeg: await readExact(handle, dataOffset + 28, compressedSize)
          };
        }
      }

      offset = nextOffset;
    }

    return null;
  } finally {
    await handle.close();
  }
};

const encodePng = async (
  input: Buffer | sharp.Sharp,
  swapRedAndBlue = false
) => {
  let pipeline = Buffer.isBuffer(input) ? sharp(input) : input;
  if (swapRedAndBlue) {
    pipeline = pipeline.recomb([
      [0, 0, 1],
      [0, 1, 0],
      [1, 0, 0]
    ]);
  }

  return pipeline
    .toColourspace("srgb")
    .png()
    .toBuffer();
};

const renderEmbeddedThumbnail = async (
  thumbnail: PsdThumbnail
) => encodePng(
  thumbnail.jpeg,
  thumbnail.resourceId === 1033
);

const renderCompositeImage = async (
  sourcePath: string
) => {
  const input = await fs.readFile(sourcePath);
  const psd = readPsd(input, {
    logMissingFeatures: false,
    skipLayerImageData: true,
    skipLinkedFilesData: true,
    skipThumbnail: true,
    throwForMissingFeatures: false,
    useImageData: true
  });
  const imageData = psd.imageData;
  if (!imageData || imageData.width <= 0 || imageData.height <= 0) {
    throw new Error("PSD 不包含可用的合成预览图。");
  }
  if (imageData.width * imageData.height > maximumPsdPixels) {
    throw new Error(`PSD 合成图超过安全像素上限 ${maximumPsdPixels}。`);
  }

  const rawBuffer = Buffer.from(
    imageData.data.buffer,
    imageData.data.byteOffset,
    imageData.data.byteLength
  );
  const artboardBounds = getReliableFirstPsdArtboardBounds(psd);
  const pipeline = sharp(rawBuffer, {
    raw: {
      width: imageData.width,
      height: imageData.height,
      channels: 4
    }
  });
  return encodePng(
    artboardBounds ? pipeline.extract(artboardBounds) : pipeline
  );
};

interface PsdArtboardWorkerResult {
  type: "rendered" | "fallback" | "error";
  buffer?: Uint8Array;
  bounds?: PsdArtboardBounds;
  message?: string;
}

const renderLargePsdFirstArtboard = (
  sourcePath: string
): Promise<Buffer | null> => new Promise((resolve, reject) => {
  const worker = new Worker(
    path.join(__dirname, "psdArtboardRenderWorker.js"),
    {
      workerData: {
        sourcePath,
        maximumPsdPixels
      }
    }
  );
  let settled = false;
  const finish = (callback: () => void) => {
    if (settled) {
      return;
    }
    settled = true;
    callback();
  };

  worker.once("message", (result: PsdArtboardWorkerResult) => {
    finish(() => {
      if (result.type === "rendered" && result.buffer) {
        resolve(Buffer.from(result.buffer));
        return;
      }
      if (result.type === "fallback") {
        resolve(null);
        return;
      }
      reject(new Error(result.message || "PSD 第一个画板渲染失败。"));
    });
  });
  worker.once("error", (error) => {
    finish(() => reject(error));
  });
  worker.once("exit", (code) => {
    if (code !== 0) {
      finish(() => reject(new Error(`PSD 画板渲染线程异常退出（${code}）。`)));
    }
  });
});

export const renderPsdFlattenedPreview = async (
  sourcePath: string
) => {
  const stat = await fs.stat(sourcePath);
  const thumbnail = await readEmbeddedThumbnail(sourcePath).catch(() => null);

  if (stat.size <= maximumCompositeFileBytes) {
    try {
      return await renderCompositeImage(sourcePath);
    } catch (error) {
      if (!thumbnail) {
        throw error;
      }
    }
  }

  if (stat.size <= maximumArtboardWorkerFileBytes) {
    const artboardPreview = await renderLargePsdFirstArtboard(sourcePath)
      .catch(() => null);
    if (artboardPreview) {
      return artboardPreview;
    }
  }

  if (thumbnail) {
    return renderEmbeddedThumbnail(thumbnail);
  }

  throw new Error(
    `PSD 过大或没有可用的合成预览图（完整解析上限 ${maximumCompositeFileBytes} 字节）。`
  );
};
