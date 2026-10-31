import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readVideoMetadataFrames, type VideoMetadataFrameResponse } from "./videoMetadataFrames";

interface PendingFrame {
  id: number; resolve: (value: VideoMetadataFrameResponse | null) => void;
  reject: (error: Error) => void; cleanup: () => void;
}
export class VideoMetadataFrameClient {
  private child?: ChildProcessWithoutNullStreams;
  private pending?: PendingFrame;
  private retiring: Promise<void> = Promise.resolve();
  private exit = Promise.resolve();
  private sequence = 0;
  private closed = false;
  private resident = 0;
  private jobs = 0;
  get residentBytes() { return this.resident; }
  constructor(private readonly helperPath: string | undefined, private readonly spawnHelper: typeof spawn = spawn) {}
  async extract(filePath: string, signal: AbortSignal): Promise<VideoMetadataFrameResponse | null> {
    await this.retiring;
    signal.throwIfAborted();
    if (this.closed || this.pending) throw new Error("metadata-video-frame-client-unavailable");
    if (!this.helperPath) return null;
    const child = this.child ?? this.start(this.helperPath);
    const id = ++this.sequence;
    if (!Number.isSafeInteger(id) || id > 2_147_483_647) throw new Error("metadata-video-frame-id-exhausted");
    return new Promise<VideoMetadataFrameResponse | null>((resolve, reject) => {
      const abort = () => this.fail(child, new Error("metadata-video-frame-cancelled"));
      const timer = setTimeout(() => this.fail(child, new Error("metadata-video-frame-timeout")), 4000);
      this.pending = { id, resolve, reject, cleanup: () => { clearTimeout(timer); signal.removeEventListener("abort", abort); } };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) return abort();
      child.stdin.write(JSON.stringify({ id, filePath }) + "\n", error => {
        if (error) this.fail(child, new Error("metadata-video-frame-send-failed"));
      });
    }).catch(async error => { await this.retiring; throw error; });
  }
  async close(): Promise<void> {
    this.closed = true;
    if (this.child) this.fail(this.child, new Error("metadata-video-frame-closed"));
    await this.retiring;
  }
  private start(helperPath: string): ChildProcessWithoutNullStreams {
    const child = this.spawnHelper(helperPath, ["--parent-pid", String(process.pid)], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }) as ChildProcessWithoutNullStreams;
    this.child = child; this.resident = 0; this.jobs = 0;
    let buffered = Buffer.alloc(0);
    this.exit = new Promise(resolve => { child.once("close", () => resolve()); child.once("error", () => { if (!child.pid) resolve(); }); });
    child.stderr.resume();
    child.stdout.on("data", (chunk: Buffer) => {
      if (this.child !== child) return;
      if (buffered.length + chunk.length > 512 * 1024) return this.fail(child, new Error("metadata-video-frame-too-large"));
      buffered = Buffer.concat([buffered, chunk]);
      const newline = buffered.indexOf(10);
      if (newline < 0) return;
      const reply = buffered.subarray(0, newline); buffered = buffered.subarray(newline + 1);
      if (!this.pending || buffered.length) return this.fail(child, new Error("metadata-video-frame-unexpected-reply"));
      try {
        const result = readVideoMetadataFrames(JSON.parse(reply.toString("utf8")), this.pending.id);
        this.resident = result.residentBytes;
        const pending = this.pending; this.pending = undefined; pending.cleanup();
        // Match native retirement before admitting another request, including the close/response race.
        if (++this.jobs >= 16 || result.residentBytes > 192 * 1024 * 1024) this.fail(child, new Error("metadata-video-frame-recycled"));
        pending.resolve(result);
      } catch { this.fail(child, new Error("metadata-video-frame-invalid-response")); }
    });
    child.on("error", () => this.fail(child, new Error("metadata-video-frame-process-failed")));
    child.stdin.on("error", () => this.fail(child, new Error("metadata-video-frame-send-failed")));
    child.on("close", () => this.fail(child, new Error("metadata-video-frame-exited")));
    return child;
  }
  private fail(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) return;
    this.child = undefined;
    const pending = this.pending; this.pending = undefined;
    pending?.cleanup();
    if (child.exitCode === null && child.signalCode === null) child.kill();
    this.retiring = this.exit.then(() => { if (!this.child) this.resident = 0; });
    pending?.reject(error);
  }
}
