import fs from "node:fs/promises";
import path from "node:path";
import type { ModelPrecision } from "./modelFactTypes";

const maximumSafeTensorsHeaderBytes = 64 * 1024 * 1024;
const maximumGgufHeaderBytes = 256 * 1024 * 1024;
const maximumGgufEntries = 2_000_000;
const maximumStringBytes = 128 * 1024 * 1024;
const ggufReadWindowBytes = 1024 * 1024;
const maximumSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);

export interface ExtractedModelFact { parameterCount: number; precision: ModelPrecision }

const toSafeCount = (value: bigint) => {
  if (value <= 0n || value > maximumSafeInteger) throw new Error("model-fact-parameter-count-out-of-range");
  return Number(value);
};
const chooseDominantPrecision = (counts: Map<ModelPrecision, bigint>): ModelPrecision => {
  let selected: ModelPrecision | null = null;
  let selectedCount = -1n;
  for (const [precision, count] of counts) {
    if (count > selectedCount) { selected = precision; selectedCount = count; }
  }
  if (!selected || selectedCount <= 0n) throw new Error("model-fact-precision-unknown");
  return selected;
};

const readExact = async (handle: fs.FileHandle, buffer: Buffer, position: number) => {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, position + offset);
    if (bytesRead === 0) throw new Error("model-fact-header-truncated");
    offset += bytesRead;
  }
};

const safeTensorPrecision = (dtype: string): ModelPrecision | null => {
  if (dtype === "F64" || dtype === "F32") return "f32";
  if (dtype === "F16" || dtype === "BF16") return "f16-bf16";
  if (dtype === "F8_E4M3" || dtype === "F8_E5M2" || dtype === "F8_E4M3FN" || dtype === "F8_E4M3FNUZ" || dtype === "F8_E5M2FNUZ" || dtype === "I8" || dtype === "U8") return "8bit";
  return null;
};

const readSafeTensorsFact = async (filePath: string): Promise<ExtractedModelFact> => {
  const handle = await fs.open(filePath, "r");
  try {
    const prefix = Buffer.alloc(8);
    await readExact(handle, prefix, 0);
    const headerLength = prefix.readBigUInt64LE();
    if (headerLength <= 0n || headerLength > BigInt(maximumSafeTensorsHeaderBytes)) throw new Error("model-fact-header-too-large");
    const header = Buffer.alloc(Number(headerLength));
    await readExact(handle, header, 8);
    const parsed = JSON.parse(header.toString("utf8")) as Record<string, unknown>;
    let parameterCount = 0n;
    const precisionCounts = new Map<ModelPrecision, bigint>();
    for (const [name, value] of Object.entries(parsed)) {
      if (name === "__metadata__") continue;
      if (!value || typeof value !== "object") throw new Error("model-fact-invalid-tensor");
      const tensor = value as { dtype?: unknown; shape?: unknown };
      if (typeof tensor.dtype !== "string" || !Array.isArray(tensor.shape) || tensor.shape.length > 16) throw new Error("model-fact-invalid-tensor");
      let elements = 1n;
      for (const dimension of tensor.shape) {
        if (!Number.isSafeInteger(dimension) || Number(dimension) < 0) throw new Error("model-fact-invalid-shape");
        elements *= BigInt(Number(dimension));
        if (elements > maximumSafeInteger) throw new Error("model-fact-parameter-count-out-of-range");
      }
      parameterCount += elements;
      if (parameterCount > maximumSafeInteger) throw new Error("model-fact-parameter-count-out-of-range");
      const precision = safeTensorPrecision(tensor.dtype);
      if (precision) precisionCounts.set(precision, (precisionCounts.get(precision) ?? 0n) + elements);
    }
    return { parameterCount: toSafeCount(parameterCount), precision: chooseDominantPrecision(precisionCounts) };
  } finally { await handle.close(); }
};
class GgufReader {
  private position = 0;
  private cache = Buffer.alloc(0);
  private cacheStart = 0;
  constructor(private readonly handle: fs.FileHandle, private readonly fileSize: number) {}
  private async read(length: number) {
    if (!Number.isSafeInteger(length) || length < 0 || this.position + length > this.fileSize || this.position + length > maximumGgufHeaderBytes) throw new Error("model-fact-header-bounds");
    const cacheOffset = this.position - this.cacheStart;
    if (cacheOffset < 0 || cacheOffset + length > this.cache.length) {
      const windowLength = Math.min(Math.max(length, ggufReadWindowBytes), this.fileSize - this.position, maximumGgufHeaderBytes - this.position);
      this.cache = Buffer.alloc(windowLength);
      this.cacheStart = this.position;
      await readExact(this.handle, this.cache, this.position);
    }
    const nextCacheOffset = this.position - this.cacheStart;
    const buffer = this.cache.subarray(nextCacheOffset, nextCacheOffset + length);
    this.position += length;
    return buffer;
  }
  private skip(length: number) {
    if (!Number.isSafeInteger(length) || length < 0 || this.position + length > this.fileSize || this.position + length > maximumGgufHeaderBytes) throw new Error("model-fact-header-bounds");
    this.position += length;
  }
  async u8() { return (await this.read(1)).readUInt8(); }
  async i8() { return (await this.read(1)).readInt8(); }
  async u16() { return (await this.read(2)).readUInt16LE(); }
  async i16() { return (await this.read(2)).readInt16LE(); }
  async u32() { return (await this.read(4)).readUInt32LE(); }
  async i32() { return (await this.read(4)).readInt32LE(); }
  async f32() { return (await this.read(4)).readFloatLE(); }
  async u64() { return (await this.read(8)).readBigUInt64LE(); }
  async i64() { return (await this.read(8)).readBigInt64LE(); }
  async f64() { return (await this.read(8)).readDoubleLE(); }
  async skipString() {
    const length = await this.u64();
    if (length > BigInt(maximumStringBytes)) throw new Error("model-fact-string-too-large");
    this.skip(Number(length));
  }
  async skipValue(type: number): Promise<void> {
    if (type === 0 || type === 1 || type === 7) { await this.read(1); return; }
    if (type === 2 || type === 3) { await this.read(2); return; }
    if (type === 4 || type === 5 || type === 6) { await this.read(4); return; }
    if (type === 8) { await this.skipString(); return; }
    if (type === 10 || type === 11 || type === 12) { await this.read(8); return; }
    if (type === 9) {
      const elementType = await this.u32();
      const count = await this.u64();
      if (count > BigInt(maximumGgufEntries)) throw new Error("model-fact-array-too-large");
      for (let index = 0; index < Number(count); index += 1) await this.skipValue(elementType);
      return;
    }
    throw new Error("model-fact-unsupported-gguf-value");
  }
}

const ggufTensorPrecision = (type: number): ModelPrecision | null => {
  if (type === 0 || type === 28) return "f32";
  if (type === 1 || type === 30) return "f16-bf16";
  if ([8, 9, 15, 24].includes(type)) return "8bit";
  if (type === 14) return "6bit";
  if ([6, 7, 13].includes(type)) return "5bit";
  if ([2, 3, 12, 20, 23, 31, 32, 33, 36].includes(type)) return "4bit";
  if ([10, 11, 16, 17, 18, 19, 21, 22, 29, 34, 35].includes(type)) return "3bit-or-less";
  return null;
};

export const extractModelFact = async (filePath: string): Promise<ExtractedModelFact> => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".safetensors") return readSafeTensorsFact(filePath);
  if (extension !== ".gguf") throw new Error("model-fact-format-unsupported");
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    const reader = new GgufReader(handle, stat.size);
    const magic = Buffer.alloc(4);
    await readExact(handle, magic, 0);
    if (magic.toString("ascii") !== "GGUF") throw new Error("model-fact-invalid-gguf");
    // The magic was read outside the bounded reader; consume it to keep a single cursor.
    await reader.u32();
    const version = await reader.u32();
    if (version < 2 || version > 3) throw new Error("model-fact-unsupported-gguf-version");
    const tensorCount = await reader.u64();
    const metadataCount = await reader.u64();
    if (tensorCount <= 0n || tensorCount > BigInt(maximumGgufEntries) || metadataCount > BigInt(maximumGgufEntries)) throw new Error("model-fact-entry-count-out-of-range");
    for (let index = 0; index < Number(metadataCount); index += 1) {
      await reader.skipString();
      await reader.skipValue(await reader.u32());
    }
    let parameterCount = 0n;
    const precisionCounts = new Map<ModelPrecision, bigint>();
    for (let index = 0; index < Number(tensorCount); index += 1) {
      await reader.skipString();
      const dimensions = await reader.u32();
      if (dimensions > 16) throw new Error("model-fact-invalid-shape");
      let elements = 1n;
      for (let dimension = 0; dimension < dimensions; dimension += 1) {
        elements *= await reader.u64();
        if (elements > maximumSafeInteger) throw new Error("model-fact-parameter-count-out-of-range");
      }
      const type = await reader.u32();
      await reader.u64();
      parameterCount += elements;
      if (parameterCount > maximumSafeInteger) throw new Error("model-fact-parameter-count-out-of-range");
      const precision = ggufTensorPrecision(type);
      if (precision) precisionCounts.set(precision, (precisionCounts.get(precision) ?? 0n) + elements);
    }
    return { parameterCount: toSafeCount(parameterCount), precision: chooseDominantPrecision(precisionCounts) };
  } finally { await handle.close(); }
};
