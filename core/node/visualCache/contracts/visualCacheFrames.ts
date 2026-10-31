export const maximumCacheImageBytes = 40 * 1024 * 1024;
export const maximumCacheFrameBytes = 64 * 1024 * 1024;
// Allocates each bounded frame once, including when Windows splits a large image into many pipe chunks.
export class VisualCacheFrameReader {
  private header = Buffer.alloc(4);
  private headerBytes = 0;
  private payload?: Buffer;
  private payloadBytes = 0;
  constructor(private readonly accept: (payload: Buffer) => void) {}
  push(chunk: Buffer): void {
    let offset = 0;
    while (offset < chunk.length) {
      if (!this.payload) {
        const count = Math.min(4 - this.headerBytes, chunk.length - offset);
        chunk.copy(this.header, this.headerBytes, offset, offset + count); offset += count; this.headerBytes += count;
        if (this.headerBytes < 4) return;
        const length = this.header.readUInt32LE();
        if (length < 2 || length > maximumCacheFrameBytes) throw new Error("core-cache-invalid-frame-size");
        this.payload = Buffer.allocUnsafe(length); this.payloadBytes = 0;
      }
      const count = Math.min(this.payload.length - this.payloadBytes, chunk.length - offset);
      chunk.copy(this.payload, this.payloadBytes, offset, offset + count); offset += count; this.payloadBytes += count;
      if (this.payloadBytes === this.payload.length) {
        const payload = this.payload; this.payload = undefined; this.headerBytes = 0; this.payloadBytes = 0;
        this.accept(payload);
      }
    }
  }
  finish(): void { if (this.headerBytes || this.payload) throw new Error("core-cache-truncated-frame"); }
}
