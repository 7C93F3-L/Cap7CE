import type { FileHandle } from "node:fs/promises";

// Bounded metadata reads; large pixel blocks are skipped by position, never allocated.
export class PsdCursor {
  position = 0;
  private bytes = 0;
  private operations = 0;
  constructor(private readonly handle: FileHandle, readonly size: number) {}
  seek(position: number) {
    if (!Number.isSafeInteger(position) || position < 0 || position > this.size) throw Error("psd-preview-offset");
    this.position = position;
  }
  skip(bytes: number) { this.seek(this.position + bytes); }
  async read(bytes: number) {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 1024 * 1024
      || this.position + bytes > this.size || (this.bytes += bytes) > 8 * 1024 * 1024 || ++this.operations > 200_000)
      throw Error("psd-preview-metadata-limit");
    const buffer = Buffer.alloc(bytes); let offset = 0;
    while (offset < bytes) {
      const result = await this.handle.read(buffer, offset, bytes - offset, this.position + offset);
      if (!result.bytesRead) throw Error("psd-preview-truncated");
      offset += result.bytesRead;
    }
    this.position += bytes; return buffer;
  }
  async u16() { return (await this.read(2)).readUInt16BE(); }
  async u32() { return (await this.read(4)).readUInt32BE(); }
  async length(large: boolean) {
    if (!large) return this.u32();
    const value = (await this.read(8)).readBigUInt64BE();
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw Error("psd-preview-offset");
    return Number(value);
  }
}
