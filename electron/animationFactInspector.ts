import fs from "node:fs/promises";
import path from "node:path";

const maximumProbeBytes = 16 * 1024 * 1024;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
type Handle = Awaited<ReturnType<typeof fs.open>>;

const readAt = async (handle: Handle, length: number, position: number) => {
  const buffer = Buffer.alloc(length);
  const result = await handle.read(buffer, 0, length, position);
  return result.bytesRead === length ? buffer : null;
};

const skipGifSubBlocks = async (handle: Handle, start: number, size: number) => {
  let offset = start;
  while (offset < size) {
    const lengthBuffer = await readAt(handle, 1, offset);
    if (!lengthBuffer) return -1;
    offset += 1;
    const length = lengthBuffer[0];
    if (length === 0) return offset;
    if (offset + length > size) return -1;
    offset += length;
  }
  return -1;
};

const inspectGif = async (handle: Handle, size: number) => {
  const header = await readAt(handle, 13, 0);
  if (!header || !/^GIF8[79]a$/u.test(header.toString("ascii", 0, 6))) return null;
  let offset = 13;
  if (header[10] & 0x80) offset += 3 * (2 ** ((header[10] & 7) + 1));
  let frames = 0;
  while (offset < size) {
    const markerBuffer = await readAt(handle, 1, offset++);
    if (!markerBuffer) return null;
    const marker = markerBuffer[0];
    if (marker === 0x3b) return frames === 0 ? null : frames > 1;
    if (marker === 0x21) {
      if (!await readAt(handle, 1, offset)) return null;
      offset = await skipGifSubBlocks(handle, offset + 1, size);
      if (offset < 0) return null;
      continue;
    }
    const descriptor = marker === 0x2c ? await readAt(handle, 9, offset) : null;
    if (!descriptor) return null;
    offset += 9;
    if (descriptor[8] & 0x80) offset += 3 * (2 ** ((descriptor[8] & 7) + 1));
    if (!await readAt(handle, 1, offset)) return null;
    offset = await skipGifSubBlocks(handle, offset + 1, size);
    if (offset < 0) return null;
    frames += 1;
    if (frames > 1) return true;
  }
  return null;
};

const inspectWebp = async (handle: Handle, size: number) => {
  const header = await readAt(handle, 12, 0);
  if (!header || header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WEBP") return null;
  const end = Math.min(size, header.readUInt32LE(4) + 8);
  let offset = 12;
  let animation = false;
  let frames = 0;
  let staticImage = false;
  while (offset + 8 <= end) {
    const chunk = await readAt(handle, 8, offset);
    if (!chunk) return null;
    const kind = chunk.toString("ascii", 0, 4);
    const length = chunk.readUInt32LE(4);
    const next = offset + 8 + length + (length & 1);
    if (next > end) return null;
    if (kind === "ANIM") animation = true;
    if (kind === "ANMF" && ++frames > 1) return true;
    if (kind === "VP8 " || kind === "VP8L") staticImage = true;
    offset = next;
  }
  if (animation) return frames === 0 ? null : frames > 1;
  return staticImage ? false : null;
};

const inspectPng = async (handle: Handle, size: number) => {
  const signature = await readAt(handle, 8, 0);
  if (!signature?.equals(pngSignature)) return null;
  let offset = 8;
  while (offset + 12 <= size) {
    const header = await readAt(handle, 8, offset);
    if (!header) return null;
    const length = header.readUInt32BE(0);
    const kind = header.toString("ascii", 4, 8);
    if (offset + 12 + length > size) return null;
    if (kind === "acTL") {
      const control = length === 8 ? await readAt(handle, 8, offset + 8) : null;
      return control ? control.readUInt32BE(0) > 1 : null;
    }
    if (kind === "IDAT" || kind === "IEND") return false;
    offset += 12 + length;
  }
  return null;
};

export const inspectAnimationFact = async (filePath: string): Promise<boolean | null> => {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maximumProbeBytes) return null;
    const extension = path.extname(filePath).toLowerCase();
    if (extension === ".gif") return await inspectGif(handle, stat.size);
    if (extension === ".webp") return await inspectWebp(handle, stat.size);
    if (extension === ".png") return await inspectPng(handle, stat.size);
    return null;
  } finally { await handle.close(); }
};
