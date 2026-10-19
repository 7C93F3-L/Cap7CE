import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import fileSystem from "node:fs/promises";
import { VisualCacheFrameReader, maximumCacheImageBytes } from "../../../electron/core/visualCacheFrames";
import type { VisualDecodeTask, VisualDecodeResult } from "../../../src/shared/visualRenderTypes";

interface Pending { id: number; operation: VisualDecodeTask["operation"]; timer: NodeJS.Timeout; resolve: (result: VisualDecodeResult) => void; reject: (error: Error) => void }
const cancelled = () => Object.assign(new Error("Visual decoder was released."), { code: "ECANCELED" });
export class VisualWorkerSlot {
  private child?: ChildProcessWithoutNullStreams;
  private pending?: Pending;
  private idle?: NodeJS.Timeout;
  private sequence = 0;
  private exits = new Set<Promise<void>>();
  constructor(private readonly directory: string, private readonly timeoutMs = 60000, private readonly idleMs = 5000) {}
  execute(task: VisualDecodeTask): Promise<VisualDecodeResult> {
    if (this.pending) return Promise.reject(new Error("core-visual-worker-busy"));
    clearTimeout(this.idle); this.idle = undefined;
    const child = this.child ?? this.start(), id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(child, Object.assign(new Error("Visual decoding timed out."), { code: "ETIMEDOUT" })), this.timeoutMs);
      this.pending = { id, operation: task.operation, timer, resolve, reject };
      const bytes = Buffer.from(JSON.stringify({ version: 1, id, task })), header = Buffer.alloc(4); header.writeUInt32LE(bytes.length);
      child.stdin.write(Buffer.concat([header, bytes]), error => { if (error) this.fail(child, new Error("core-visual-worker-unavailable")); });
    });
  }
  close(): void { clearTimeout(this.idle); this.idle = undefined; if (this.child) this.fail(this.child, cancelled()); }
  async closeAndWait(): Promise<void> { this.close(); await Promise.allSettled([...this.exits]); }
  private start(): ChildProcessWithoutNullStreams {
    // The cache owner is already the pinned Node within the native kill-on-close Job. Children inherit that Job.
    const temporaryRoot = path.resolve(process.env.CAP7CE_CORE_SCRATCH_ROOT ?? os.tmpdir()), scratch = fs.mkdtempSync(path.join(temporaryRoot, "cap7ce-visual-worker-"));
    const child = spawn(process.execPath, ["--max-old-space-size=256", path.join(this.directory, "visual-render.cjs")], {
      windowsHide: true, shell: false, cwd: this.directory, env: { ...process.env, CAP7CE_VISUAL_SCRATCH: scratch }, stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child; const reader = new VisualCacheFrameReader(bytes => this.receive(child, bytes)); child.stderr.resume();
    const ended = new Promise<void>(resolve => child.once("close", () => {
      if (path.dirname(scratch) !== temporaryRoot || !path.basename(scratch).startsWith("cap7ce-visual-worker-")) throw new Error("core-visual-invalid-scratch");
      void fileSystem.rm(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }).catch(() => undefined)
        .finally(() => { this.exits.delete(ended); resolve(); });
    })); this.exits.add(ended);
    child.on("error", () => this.fail(child, new Error("core-visual-worker-unavailable")));
    child.on("close", () => this.fail(child, new Error("core-visual-worker-exited")));
    child.stdin.on("error", () => this.fail(child, new Error("core-visual-worker-unavailable")));
    child.stdout.on("error", () => this.fail(child, new Error("core-visual-worker-unavailable")));
    child.stdout.on("data", (bytes: Buffer) => { try { reader.push(bytes); } catch { this.fail(child, new Error("core-visual-worker-invalid-response")); } });
    return child;
  }
  private receive(child: ChildProcessWithoutNullStreams, bytes: Buffer): void {
    if (this.child !== child) return;
    const pending = this.pending;
    try {
      const value = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
      if (!pending || value?.id !== pending.id || !Number.isSafeInteger(value.rssBytes) || value.rssBytes < 0
        || !["id,result,rssBytes", "error,id,rssBytes"].includes(Object.keys(value).sort().join(","))) throw new Error();
      if (value.error) {
        if (typeof value.error.message !== "string" || value.error.message.length > 1024 || value.error.code !== "core-visual-source-failed"
          || Object.keys(value.error).sort().join(",") !== "code,message") throw new Error();
      } else this.validate(value.result, pending.operation);
      clearTimeout(pending.timer); this.pending = undefined;
      if (value.error) pending.reject(Object.assign(new Error(value.error.message), { code: value.error.code })); else pending.resolve(value.result);
      if (value.rssBytes > 768 * 1024 * 1024) this.close();
      else { this.idle = setTimeout(() => this.close(), this.idleMs); this.idle.unref(); }
    } catch { this.fail(child, new Error("core-visual-worker-invalid-response")); }
  }
  private validate(result: VisualDecodeResult, operation: VisualDecodeTask["operation"]): void {
    if (!result || typeof result !== "object") throw new Error();
    if (operation === "decode") {
      if (result.kind !== "image" || typeof result.base64 !== "string" || result.base64.length > Math.ceil(maximumCacheImageBytes / 3) * 4
        || !["image/jpeg", "image/png"].includes(result.mimeType) || Object.keys(result).sort().join(",") !== "base64,kind,mimeType") throw new Error();
      const image = Buffer.from(result.base64, "base64");
      if (!image.length || image.length > maximumCacheImageBytes || image.toString("base64") !== result.base64) throw new Error();
    } else if (operation === "sourcePreview") {
      if (result.kind !== "sourcePreview" || typeof result.value !== "boolean" || Object.keys(result).sort().join(",") !== "kind,value") throw new Error();
    } else if (result.kind !== "dimensions" || Object.keys(result).sort().join(",") !== "kind,value" || result.value !== null
      && (!Number.isSafeInteger(result.value?.width) || !Number.isSafeInteger(result.value?.height) || result.value.width < 1 || result.value.height < 1 || Object.keys(result.value).sort().join(",") !== "height,width")) throw new Error();
  }
  private fail(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) return;
    this.child = undefined; child.kill(); clearTimeout(this.idle); this.idle = undefined;
    const pending = this.pending; this.pending = undefined;
    if (pending) { clearTimeout(pending.timer); pending.reject(error); }
  }
}
