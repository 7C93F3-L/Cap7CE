import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
const children = new Set<ChildProcess>();
process.once("exit", () => { for (const child of children) child.kill(); });
export interface CoreNativeOptions { packaged?: boolean; resourcesPath?: string }
export const coreNativeExecutable = (options: CoreNativeOptions, resource: string, artifact: string, name: string) => options.packaged
  ? path.join(options.resourcesPath ?? process.resourcesPath, resource, name)
  : path.resolve(__dirname, "../../core/artifacts", artifact, name);

// Private inherited streams; one request and no automatic replay of mutations.
export function requestCoreNative(executable: string, args: string[], request: Record<string, unknown>,
  prefix: string, maximumBytes = 1024 * 1024, timeoutMs = 25_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const contents = Buffer.from(JSON.stringify({ version: 1, ...request }));
    if (contents.length > maximumBytes) { reject(new Error(`${prefix}-state-too-large`)); return; }
    const header = Buffer.alloc(4); header.writeInt32LE(contents.length);
    const child = spawn(executable, args, { windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = []; let total = 0, settled = false;
    children.add(child);
    const finish = () => { clearTimeout(timeout); children.delete(child); };
    const fail = (error: Error) => { if (settled) return; settled = true; finish(); child.kill(); reject(error); };
    const timeout = timeoutMs > 0 ? setTimeout(() => fail(new Error(`${prefix}-host-timeout`)), timeoutMs) : undefined;
    child.on("error", () => fail(new Error(`${prefix}-host-unavailable`)));
    child.stdin.on("error", () => fail(new Error(`${prefix}-host-unavailable`))); child.stderr.resume();
    child.stdout.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maximumBytes + 132) { fail(new Error(`${prefix}-host-invalid-response`)); return; }
      chunks.push(chunk);
    });
    child.on("close", code => {
      if (settled) return; settled = true; finish();
      try {
        const bytes = Buffer.concat(chunks);
        if (code !== 0 || bytes.length < 6 || bytes.readInt32LE(0) !== bytes.length - 4) throw new Error(`${prefix}-host-invalid-response`);
        resolve(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(4))));
      } catch (error) { reject(error); }
    });
    child.stdin.end(Buffer.concat([header, contents]));
  });
}
