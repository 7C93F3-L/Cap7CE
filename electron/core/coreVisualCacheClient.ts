import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { metadataWorkerPaths } from "../metadataExtraction/metadataWorkerPaths";
import { CoreNodeRpcSession, referenceCoreNodeProcess } from "./coreNodeRpcSession";
import { coreVisualExecutable } from "./coreVisualResources";
import { stopCoreVisualHost } from "./coreVisualHostStop";

const nodeSha256 = "3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5";
const unavailable = () => new Error("core-cache-host-unavailable");
export class CoreVisualCacheClient {
  private child?: ChildProcessWithoutNullStreams;
  private starting?: Promise<ChildProcessWithoutNullStreams>;
  private session?: CoreNodeRpcSession;
  private sequence = 0;
  private exits = new Set<Promise<void>>();
  private nonces = new WeakMap<ChildProcessWithoutNullStreams, string>();
  private closed = false;
  constructor(private readonly root: string, private readonly executable = metadataWorkerPaths().executable,
    private readonly worker = path.join(path.dirname(executable), "visual-cache.cjs"), private readonly supervisor = coreVisualExecutable()) {}
  async request(method: string, args: unknown[] = []): Promise<unknown> {
    if (this.closed) throw unavailable();
    const child = this.child ?? await (this.starting ??= this.start().finally(() => { this.starting = undefined; }));
    if (this.closed || child !== this.child) throw unavailable();
    return this.session!.request(method, args);
  }
  close(): void { this.closed = true; if (this.child) this.fail(this.child); }
  requestIfActive(method: string, args: unknown[]): Promise<unknown> {
    return this.child || this.starting ? this.request(method, args) : Promise.resolve(null);
  }
  async releaseSourceHandles(): Promise<void> {
    if (!this.child && !this.starting) return;
    try { await this.request("releaseSourceHandles"); }
    catch {
      if (this.child) { referenceCoreNodeProcess(this.child, true); this.fail(this.child); }
      await Promise.allSettled([...this.exits]); // A failed release retires its Job without disabling independent file operations.
    }
  }
  private async start(): Promise<ChildProcessWithoutNullStreams> {
    await Promise.allSettled([...this.exits]); // A previous writer must be gone before a replacement can publish.
    if (crypto.createHash("sha256").update(await fs.readFile(this.executable)).digest("hex") !== nodeSha256) throw unavailable();
    if (this.closed) throw unavailable();
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (["NODE_OPTIONS", "NODE_PATH", "ELECTRON_RUN_AS_NODE", "CAP7CE_CORE_VISUAL_HOST", "CAP7CE_CORE_SCRATCH_ROOT", "CAP7CE_VISUAL_SCRATCH"].includes(key.toUpperCase())) delete env[key];
    env.CAP7CE_CORE_VISUAL_HOST = this.supervisor;
    const nonce = crypto.randomUUID();
    const child = spawn(this.supervisor, ["--node-worker", "--parent-pid", String(process.pid), this.executable, this.worker, this.root, nonce], {
      windowsHide: true, detached: true, shell: false, cwd: path.dirname(this.worker), env, stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;
    this.nonces.set(child, nonce);
    const ended = new Promise<void>(resolve => child.once("close", () => { this.exits.delete(ended); resolve(); })); this.exits.add(ended);
    this.session = new CoreNodeRpcSession(child, () => ++this.sequence, () => this.fail(child));
    child.stderr.resume();
    child.on("error", () => this.fail(child)); child.on("close", () => this.fail(child));
    // The first request follows the awaited startup in the same microtask; idle pipes do not keep a Shell/test alive.
    referenceCoreNodeProcess(child, false); return child;
  }
  private fail(child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child) return;
    this.child = undefined; stopCoreVisualHost(this.supervisor, child, this.nonces.get(child) ?? "");
    this.session?.close(); this.session = undefined;
  }
}
