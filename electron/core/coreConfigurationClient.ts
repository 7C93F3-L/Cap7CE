import { spawn } from "node:child_process";
import path from "node:path";

const maximumBytes = 1024 * 1024;
export interface CoreConfigurationOptions { packaged?: boolean; resourcesPath?: string }
const executable = (options: CoreConfigurationOptions) => options.packaged
  ? path.join(options.resourcesPath ?? process.resourcesPath, "core-configuration/v1/Cap7CE.Core.Configuration.Host.exe")
  : path.resolve(__dirname, "../../core/artifacts/configuration-host/Cap7CE.Core.Configuration.Host.exe");

// Private inherited streams, one bounded request, no listener and no retry of mutations.
export const requestCoreConfiguration = (filePath: string, request: Record<string, string>, options: CoreConfigurationOptions = {}): Promise<unknown> => new Promise((resolve, reject) => {
  const contents = Buffer.from(JSON.stringify({ version: 1, ...request }));
  if (contents.length > maximumBytes) { reject(new Error("favorite-directories-state-too-large")); return; }
  const header = Buffer.alloc(4); header.writeInt32LE(contents.length);
  const child = spawn(executable(options), ["--favorites-file", filePath], { windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] });
  const chunks: Buffer[] = []; let total = 0, settled = false;
  const fail = (error: Error) => { if (settled) return; settled = true; clearTimeout(timeout); child.kill(); reject(error); };
  const timeout = setTimeout(() => fail(new Error("favorite-directories-host-timeout")), 25_000);
  child.on("error", () => fail(new Error("favorite-directories-host-unavailable")));
  child.stdin.on("error", () => fail(new Error("favorite-directories-host-unavailable")));
  child.stderr.resume();
  child.stdout.on("data", (chunk: Buffer) => {
    total += chunk.length;
    if (total > maximumBytes + 132) { fail(new Error("favorite-directories-host-invalid-response")); return; }
    chunks.push(chunk);
  });
  child.on("close", code => {
    if (settled) return; settled = true; clearTimeout(timeout);
    try {
      const bytes = Buffer.concat(chunks);
      if (code !== 0 || bytes.length < 6 || bytes.readInt32LE(0) !== bytes.length - 4) throw new Error("favorite-directories-host-invalid-response");
      const response = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(4)));
      if (response.ok !== true) throw new Error(typeof response.error === "string" && /^favorite-director(?:y|ies)-[a-z-]+$/.test(response.error)
        ? response.error : "favorite-directories-host-invalid-response");
      resolve(response.directories);
    } catch (error) { reject(error); }
  });
  child.stdin.end(Buffer.concat([header, contents]));
});
