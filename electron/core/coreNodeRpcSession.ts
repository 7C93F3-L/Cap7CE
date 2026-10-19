import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { maximumCacheFrameBytes, VisualCacheFrameReader } from "./visualCacheFrames";

interface Pending { bytes: number; resolve: (value: unknown) => void; reject: (error: Error) => void }
const unavailable = () => new Error("core-cache-host-unavailable");
export const referenceCoreNodeProcess = (child: ChildProcessWithoutNullStreams, enabled: boolean): void => {
  if (enabled) child.ref(); else child.unref();
  for (const stream of [child.stdin, child.stdout, child.stderr]) {
    const pipe = stream as typeof stream & { ref?: () => void; unref?: () => void };
    if (enabled) pipe.ref?.(); else pipe.unref?.();
  }
};
// Owns only a single private RPC pipe session. Executable selection and process retirement belong to its caller.
export class CoreNodeRpcSession {
  private readonly pending = new Map<number, Pending>();
  private pendingBytes = 0;
  private closed = false;
  constructor(private readonly child: ChildProcessWithoutNullStreams, private readonly nextId: () => number, private readonly onFatal: () => void) {
    const reader = new VisualCacheFrameReader(bytes => this.receive(bytes));
    child.stdin.on("error", () => this.fail()); child.stdout.on("error", () => this.fail());
    child.stdout.on("data", (bytes: Buffer) => { if (this.closed) return; try { reader.push(bytes); } catch { this.fail(); } });
  }
  request(method: string, args: unknown[]): Promise<unknown> {
    if (this.closed || this.pending.size >= 64) throw unavailable();
    const id = this.nextId(), bytes = Buffer.from(JSON.stringify({ version: 1, id, method, args }));
    if (!Number.isSafeInteger(id) || bytes.length > maximumCacheFrameBytes) throw new Error("core-cache-request-too-large");
    if (this.pendingBytes + bytes.length > 2 * maximumCacheFrameBytes) throw new Error("core-cache-busy");
    referenceCoreNodeProcess(this.child, true);
    return new Promise((resolve, reject) => {
      this.pendingBytes += bytes.length; this.pending.set(id, { bytes: bytes.length, resolve, reject });
      const header = Buffer.alloc(4); header.writeUInt32LE(bytes.length);
      this.child.stdin.write(Buffer.concat([header, bytes]), error => { if (error) this.fail(); });
    });
  }
  close(): void {
    this.closed = true;
    for (const pending of this.pending.values()) pending.reject(unavailable()); this.pending.clear(); this.pendingBytes = 0;
  }
  private receive(bytes: Buffer): void {
    if (this.closed) return;
    try {
      const value = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
      const keys = value && typeof value === "object" ? Object.keys(value).sort().join(",") : "";
      if (!Number.isSafeInteger(value?.id) || !["id,result", "error,id"].includes(keys)) throw unavailable();
      const pending = this.pending.get(value.id); if (!pending) throw unavailable();
      if (keys === "error,id") {
        if (typeof value.error?.message !== "string" || typeof value.error?.code !== "string") throw unavailable();
        this.pending.delete(value.id); this.pendingBytes -= pending.bytes; pending.reject(Object.assign(new Error(value.error.message), { code: value.error.code }));
      } else { this.pending.delete(value.id); this.pendingBytes -= pending.bytes; pending.resolve(value.result); }
      if (this.pending.size === 0) referenceCoreNodeProcess(this.child, false);
    } catch { this.fail(); }
  }
  private fail(): void { if (!this.closed) { this.onFatal(); this.close(); } }
}
