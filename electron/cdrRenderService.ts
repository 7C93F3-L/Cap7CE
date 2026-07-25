import fs from "node:fs/promises";
import { promisify } from "node:util";
import { inflateRaw } from "node:zlib";

interface ZipPreviewEntry {
  name: string;
  flags: number;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const inflateRawAsync = promisify(inflateRaw);
const endOfCentralDirectorySignature = 0x06054b50;
const centralDirectorySignature = 0x02014b50;
const localFileHeaderSignature = 0x04034b50;
const maximumZipTailBytes = 65_557;
const maximumCentralDirectoryBytes = 20 * 1024 * 1024;
const maximumCentralDirectoryEntries = 100_000;
const maximumCompressedPreviewBytes = 25 * 1024 * 1024;
const maximumPreviewBytes = 50 * 1024 * 1024;
const preferredPreviewNames = [
  "previews/thumbnail.png",
  "previews/page1.png"
];

const readExact = async (
  handle: fs.FileHandle,
  position: number,
  length: number
) => {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    throw new Error("CDR 文件意外结束。");
  }
  return buffer;
};

const findEndOfCentralDirectory = (tail: Buffer) => {
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) === endOfCentralDirectorySignature) {
      return offset;
    }
  }
  return -1;
};

const readPreviewEntry = async (
  handle: fs.FileHandle,
  fileSize: number
): Promise<ZipPreviewEntry> => {
  const tailLength = Math.min(fileSize, maximumZipTailBytes);
  const tailOffset = fileSize - tailLength;
  const tail = await readExact(handle, tailOffset, tailLength);
  const endOffset = findEndOfCentralDirectory(tail);
  if (endOffset < 0) {
    throw new Error("CDR 不是受支持的现代 ZIP 容器。");
  }

  const diskNumber = tail.readUInt16LE(endOffset + 4);
  const centralDiskNumber = tail.readUInt16LE(endOffset + 6);
  const entryCount = tail.readUInt16LE(endOffset + 10);
  const centralDirectorySize = tail.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = tail.readUInt32LE(endOffset + 16);
  if (
    diskNumber !== 0
    || centralDiskNumber !== 0
    || entryCount === 0xffff
    || entryCount > maximumCentralDirectoryEntries
    || centralDirectorySize === 0xffffffff
    || centralDirectorySize > maximumCentralDirectoryBytes
    || centralDirectoryOffset === 0xffffffff
    || centralDirectoryOffset + centralDirectorySize > fileSize
  ) {
    throw new Error("CDR 使用了不支持的分卷或 ZIP64 容器。");
  }

  const centralDirectory = await readExact(
    handle,
    centralDirectoryOffset,
    centralDirectorySize
  );
  const entries = new Map<string, ZipPreviewEntry>();
  let offset = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > centralDirectory.length
      || centralDirectory.readUInt32LE(offset) !== centralDirectorySignature
    ) {
      throw new Error("CDR 中央目录结构无效。");
    }

    const flags = centralDirectory.readUInt16LE(offset + 8);
    const compressionMethod = centralDirectory.readUInt16LE(offset + 10);
    const compressedSize = centralDirectory.readUInt32LE(offset + 20);
    const uncompressedSize = centralDirectory.readUInt32LE(offset + 24);
    const nameLength = centralDirectory.readUInt16LE(offset + 28);
    const extraLength = centralDirectory.readUInt16LE(offset + 30);
    const commentLength = centralDirectory.readUInt16LE(offset + 32);
    const localHeaderOffset = centralDirectory.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > centralDirectory.length) {
      throw new Error("CDR 中央目录条目长度无效。");
    }

    const name = centralDirectory
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString((flags & 0x0800) !== 0 ? "utf8" : "latin1")
      .replace(/\\/g, "/")
      .toLowerCase();
    if (preferredPreviewNames.includes(name)) {
      entries.set(name, {
        name,
        flags,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset
      });
    }
    offset = nextOffset;
  }

  for (const name of preferredPreviewNames) {
    const entry = entries.get(name);
    if (entry) {
      return entry;
    }
  }
  throw new Error("CDR 不包含可用的第一页或缩略图预览。");
};

const decodePreviewEntry = async (
  handle: fs.FileHandle,
  entry: ZipPreviewEntry
) => {
  if ((entry.flags & 0x0001) !== 0) {
    throw new Error("CDR 内嵌预览已加密，无法读取。");
  }
  if (
    entry.compressedSize <= 0
    || entry.uncompressedSize <= 0
    || entry.compressedSize > maximumCompressedPreviewBytes
    || entry.uncompressedSize > maximumPreviewBytes
  ) {
    throw new Error("CDR 内嵌预览超过安全大小上限。");
  }
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    throw new Error(`CDR 内嵌预览使用了不支持的压缩方式 ${entry.compressionMethod}。`);
  }

  const localHeader = await readExact(handle, entry.localHeaderOffset, 30);
  if (localHeader.readUInt32LE(0) !== localFileHeaderSignature) {
    throw new Error("CDR 内嵌预览本地文件头无效。");
  }
  const nameLength = localHeader.readUInt16LE(26);
  const extraLength = localHeader.readUInt16LE(28);
  const dataOffset = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const compressed = await readExact(handle, dataOffset, entry.compressedSize);
  const preview = entry.compressionMethod === 0
    ? compressed
    : Buffer.from(await inflateRawAsync(compressed));
  if (preview.length !== entry.uncompressedSize) {
    throw new Error("CDR 内嵌预览解压长度不匹配。");
  }
  if (
    preview.length < 8
    || !preview.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    throw new Error("CDR 内嵌预览不是有效的 PNG 图像。");
  }
  return preview;
};

export const readCdrFlattenedPreview = async (sourcePath: string) => {
  const handle = await fs.open(sourcePath, "r");
  try {
    const stat = await handle.stat();
    const entry = await readPreviewEntry(handle, stat.size);
    return await decodePreviewEntry(handle, entry);
  } finally {
    await handle.close();
  }
};
