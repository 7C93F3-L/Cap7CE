import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { coreNativeExecutable, type CoreNativeOptions } from "./coreNativeRequest";
import { coreTrashMaximumBytes, readCoreTrashResult, type CoreTrashRequest, type CoreTrashResult } from "./coreTrashProtocol";

interface Pending {
  id: number; request: CoreTrashRequest; resolve: (result: CoreTrashResult) => void; reject: (error: Error) => void;
  chunks: Buffer[]; bytes: number; expected?: number;
}
// Lazy ordinary NativeAOT owner; no idle polling, mutation replay or deadline around native dialogs.
export class CoreTrashClient {
  private child?: ChildProcessWithoutNullStreams;
  private pending?: Pending;
  private sequence = 0;
  private queued = 0;
  private closed = false;
  private serial: Promise<unknown> = Promise.resolve();
  constructor(private readonly executable: string) {}
  request(value: CoreTrashRequest): Promise<CoreTrashResult> {
    if (this.closed) return Promise.reject(new Error("core-trash-client-closed"));
    if (this.queued >= 64) return Promise.reject(new Error("core-trash-client-busy"));
    const request = { mode: value.mode, targets: value.targets.map(item => ({ path: item.path, isDirectory: item.isDirectory })), cacheRoots: [...value.cacheRoots] };
    this.queued++;
    const work = this.serial.then(() => this.send(request)).finally(() => { this.queued--; });
    this.serial = work.catch(() => undefined); return work;
  }
  close(): void { this.closed = true; if (this.child) this.fail(this.child, new Error("core-trash-client-closed")); }
  private send(request: CoreTrashRequest): Promise<CoreTrashResult> {
    if (this.closed) return Promise.reject(new Error("core-trash-client-closed"));
    const id = ++this.sequence;
    const bytes = Buffer.from(JSON.stringify({ version: 1, requestId: id, ...request }));
    if (bytes.length > coreTrashMaximumBytes || !Number.isSafeInteger(id)) return Promise.reject(new Error("core-trash-state-too-large"));
    const child = this.child ?? this.start();
    return new Promise((resolve, reject) => {
      this.pending = { id, request, resolve, reject, chunks: [], bytes: 0 };
      const header = Buffer.alloc(4); header.writeInt32LE(bytes.length);
      child.stdin.write(Buffer.concat([header, bytes]), error => { if (error) this.fail(child, new Error("core-trash-host-unavailable")); });
    });
  }
  private start(): ChildProcessWithoutNullStreams {
    const child = spawn(this.executable, ["--trash-session", "--parent-pid", String(process.pid)], {
      windowsHide: true, shell: false, cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;
    child.stderr.resume();
    child.on("error", () => this.fail(child, new Error("core-trash-host-unavailable")));
    child.stdin.on("error", () => this.fail(child, new Error("core-trash-host-unavailable")));
    child.on("close", () => this.fail(child, new Error("core-trash-host-exited")));
    child.stdout.on("data", (bytes: Buffer) => this.receive(child, bytes));
    return child;
  }
  private receive(child: ChildProcessWithoutNullStreams, bytes: Buffer): void {
    if (child !== this.child) return;
    const pending = this.pending;
    if (!pending) return this.fail(child, new Error("core-trash-host-invalid-response"));
    pending.bytes += bytes.length; pending.chunks.push(bytes);
    if (pending.bytes > coreTrashMaximumBytes + 4) return this.fail(child, new Error("core-trash-host-invalid-response"));
    if (pending.expected === undefined && pending.bytes >= 4) {
      pending.expected = Buffer.concat(pending.chunks, pending.bytes).readInt32LE(0);
      if (pending.expected < 2 || pending.expected > coreTrashMaximumBytes) return this.fail(child, new Error("core-trash-host-invalid-response"));
    }
    if (pending.expected === undefined || pending.bytes < pending.expected + 4) return;
    try {
      if (pending.bytes !== pending.expected + 4) throw new Error("core-trash-host-invalid-response");
      const value: unknown = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(pending.chunks).subarray(4)));
      const result = readCoreTrashResult(value, pending.id, pending.request);
      this.pending = undefined; pending.resolve(result);
    } catch { this.fail(child, new Error("core-trash-host-invalid-response")); }
  }
  private fail(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) return;
    this.child = undefined;
    const pending = this.pending; this.pending = undefined;
    child.kill(); pending?.reject(error);
  }
}
const clients = new Map<string, CoreTrashClient>();
export const closeCoreTrashClients = (): void => { for (const client of clients.values()) client.close(); clients.clear(); };
process.once("exit", closeCoreTrashClients);
export const requestCoreTrash = (options: CoreNativeOptions, request: CoreTrashRequest): Promise<CoreTrashResult> => {
  const executable = coreNativeExecutable(options, "core-file-operations/v1", "file-operations-host", "Cap7CE.Core.FileOperations.Host.exe");
  let client = clients.get(executable);
  if (!client) { client = new CoreTrashClient(executable); clients.set(executable, client); }
  return client.request(request);
};
