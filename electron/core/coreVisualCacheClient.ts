import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { metadataWorkerPaths } from "../metadataExtraction/metadataWorkerPaths";
import { maximumCacheFrameBytes, VisualCacheFrameReader } from "./visualCacheFrames";
import { coreVisualExecutable } from "./coreVisualResources";

const nodeSha256 = "3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5";
interface Pending { bytes: number; resolve: (value: unknown) => void; reject: (error: Error) => void }
const unavailable = () => new Error("core-cache-host-unavailable");
export class CoreVisualCacheClient {
  private child?: ChildProcessWithoutNullStreams;
  private starting?: Promise<ChildProcessWithoutNullStreams>;
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private pendingBytes = 0;
  private closed = false;
  constructor(private readonly root: string, private readonly executable = metadataWorkerPaths().executable,
    private readonly worker = path.join(path.dirname(executable), "visual-cache.cjs"), private readonly supervisor = coreVisualExecutable()) {}
  async request(method: string, args: unknown[] = []): Promise<unknown> {
    if (this.closed) throw unavailable();
    const child = this.child ?? await (this.starting ??= this.start().finally(() => { this.starting = undefined; }));
    if (this.closed || child !== this.child || this.pending.size >= 64) throw unavailable();
    const id = ++this.sequence, bytes = Buffer.from(JSON.stringify({ version: 1, id, method, args }));
    if (!Number.isSafeInteger(id) || bytes.length > maximumCacheFrameBytes) throw new Error("core-cache-request-too-large");
    if (this.pendingBytes + bytes.length > 2 * maximumCacheFrameBytes) throw new Error("core-cache-busy");
    this.reference(child, true);
    return new Promise((resolve, reject) => {
      this.pendingBytes += bytes.length; this.pending.set(id, { bytes: bytes.length, resolve, reject });
      const header = Buffer.alloc(4); header.writeUInt32LE(bytes.length);
      child.stdin.write(Buffer.concat([header, bytes]), error => { if (error) this.fail(child); });
    });
  }
  close(): void { this.closed = true; if (this.child) this.fail(this.child); }
  private async start(): Promise<ChildProcessWithoutNullStreams> {
    if (crypto.createHash("sha256").update(await fs.readFile(this.executable)).digest("hex") !== nodeSha256) throw unavailable();
    if (this.closed) throw unavailable();
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (["NODE_OPTIONS", "NODE_PATH", "ELECTRON_RUN_AS_NODE"].includes(key.toUpperCase())) delete env[key];
    const child = spawn(this.supervisor, ["--node-worker", "--parent-pid", String(process.pid), this.executable, this.worker, this.root], {
      windowsHide: true, shell: false, cwd: path.dirname(this.worker), env, stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;
    const reader = new VisualCacheFrameReader(bytes => this.receive(child, bytes));
    child.stderr.resume();
    child.on("error", () => this.fail(child)); child.on("close", () => this.fail(child));
    child.stdin.on("error", () => this.fail(child)); child.stdout.on("error", () => this.fail(child));
    child.stdout.on("data", (bytes: Buffer) => { try { reader.push(bytes); } catch { this.fail(child); } });
    // The first request follows the awaited startup in the same microtask; idle pipes do not keep a Shell/test alive.
    this.reference(child, false); return child;
  }
  private receive(child: ChildProcessWithoutNullStreams, bytes: Buffer): void {
    if (child !== this.child) return;
    try {
      const value = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
      const keys = value && typeof value === "object" ? Object.keys(value).sort().join(",") : "";
      if (!Number.isSafeInteger(value?.id) || !["id,result", "error,id"].includes(keys)) throw unavailable();
      const pending = this.pending.get(value.id); if (!pending) throw unavailable();
      if (keys === "error,id") {
        if (typeof value.error?.message !== "string" || typeof value.error?.code !== "string") throw unavailable();
        this.pending.delete(value.id); this.pendingBytes -= pending.bytes; pending.reject(Object.assign(new Error(value.error.message), { code: value.error.code }));
      } else { this.pending.delete(value.id); this.pendingBytes -= pending.bytes; pending.resolve(value.result); }
      if (this.pending.size === 0) this.reference(child, false);
    } catch { this.fail(child); }
  }
  private reference(child: ChildProcessWithoutNullStreams, enabled: boolean): void {
    if (enabled) child.ref(); else child.unref();
    for (const stream of [child.stdin, child.stdout, child.stderr]) {
      const pipe = stream as typeof stream & { ref?: () => void; unref?: () => void };
      if (enabled) pipe.ref?.(); else pipe.unref?.();
    }
  }
  private fail(child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child) return;
    this.child = undefined; child.kill();
    for (const pending of this.pending.values()) pending.reject(unavailable()); this.pending.clear(); this.pendingBytes = 0;
  }
}
