import { nativeImage } from "electron";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const binaryEpsMagic = Buffer.from([0xc5, 0xd0, 0xd3, 0xc6]);
const maximumEmbeddedPreviewBytes = 100 * 1024 * 1024;

const readExact = async (
  handle: fs.FileHandle,
  position: number,
  length: number
) => {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    throw new Error("矢量文件意外结束。");
  }
  return buffer;
};

const isTiffBuffer = (buffer: Buffer) => (
  buffer.length >= 4
  && (
    buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00]))
    || buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))
  )
);

export const assertPdfCompatibleIllustratorFile = async (sourcePath: string) => {
  const handle = await fs.open(sourcePath, "r");
  try {
    const signature = await readExact(handle, 0, 5);
    if (signature.toString("ascii") !== "%PDF-") {
      throw new Error(
        "AI 文件未包含 PDF 兼容内容，请在 Illustrator 保存时启用 PDF 兼容文件。"
      );
    }
  } finally {
    await handle.close();
  }
};

const readEpsEmbeddedPreview = async (sourcePath: string) => {
  const handle = await fs.open(sourcePath, "r");
  try {
    const stat = await handle.stat();
    const header = await readExact(handle, 0, 30);
    if (!header.subarray(0, 4).equals(binaryEpsMagic)) {
      throw new Error(
        "EPS 没有可用的二进制预览；当前仅支持包含内嵌 TIFF 预览的 EPS。"
      );
    }

    const tiffOffset = header.readUInt32LE(20);
    const tiffLength = header.readUInt32LE(24);
    if (
      tiffOffset <= 0
      || tiffLength <= 0
      || tiffLength > maximumEmbeddedPreviewBytes
      || tiffOffset + tiffLength > stat.size
    ) {
      throw new Error("EPS 内嵌 TIFF 预览范围无效或超过安全大小上限。");
    }

    const preview = await readExact(handle, tiffOffset, tiffLength);
    if (!isTiffBuffer(preview)) {
      throw new Error("EPS 内嵌预览不是可识别的 TIFF 图像。");
    }
    return preview;
  } finally {
    await handle.close();
  }
};

export const renderEpsEmbeddedPreview = async (
  sourcePath: string,
  maxWidth: number,
  maxHeight: number
) => {
  const preview = await readEpsEmbeddedPreview(sourcePath);
  const tempPath = path.join(
    os.tmpdir(),
    `cap7ce-eps-${process.pid}-${crypto.randomUUID()}.tif`
  );
  await fs.writeFile(tempPath, preview);
  try {
    const image = await nativeImage.createThumbnailFromPath(tempPath, {
      width: maxWidth,
      height: maxHeight
    });
    if (image.isEmpty()) {
      throw new Error("Windows 无法解码 EPS 内嵌 TIFF 预览。");
    }
    return image.toPNG();
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
};
