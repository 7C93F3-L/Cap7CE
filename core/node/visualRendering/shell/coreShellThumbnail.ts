import { spawn } from "node:child_process";
import path from "node:path";
import { coreVisualExecutable } from "./resources";
import { VisualCacheFrameReader, maximumCacheImageBytes } from "../../visualCache/contracts/visualCacheFrames";

export const requestCoreShellThumbnail = (source: string, edge: number, executable = coreVisualExecutable(), timeoutMs = 15000): Promise<Buffer> => {
  if (typeof source !== "string" || source.length > 32767 || source.includes("\0")) return Promise.reject(new Error("core-thumbnail-invalid-request"));
  const sourcePath = path.resolve(source);
  if (!Number.isInteger(edge) || edge < 1 || edge > 4096 || !sourcePath || sourcePath.length > 32767 || sourcePath.includes("\0"))
    return Promise.reject(new Error("core-thumbnail-invalid-request"));
  const encoded = Buffer.from(sourcePath, "utf16le");
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["--thumbnail", "--parent-pid", String(process.pid)], { windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let image: Buffer | undefined, failure: Error | undefined, finished = false;
    const stop = (error: Error) => { failure ??= error; child.kill(); };
    const reader = new VisualCacheFrameReader(bytes => {
      if (image || bytes.length < 12 || bytes.length > maximumCacheImageBytes + 12 || bytes.readUInt32LE(0) !== 1
        || bytes.readUInt32LE(8) !== bytes.length - 12) throw new Error("core-thumbnail-invalid-response");
      const status = bytes.readInt32LE(4);
      if (status < 0) throw Object.assign(new Error(`Windows thumbnail failed (0x${(status >>> 0).toString(16)}).`), { code: "CORE_THUMBNAIL_UNAVAILABLE" });
      image = bytes.subarray(12);
      if (image.length < 8 || !image.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error("core-thumbnail-invalid-response");
    });
    const timer = setTimeout(() => stop(Object.assign(new Error("Windows thumbnail timed out."), { code: "ETIMEDOUT" })), timeoutMs);
    child.stderr.resume(); child.on("error", error => stop(error)); child.stdin.on("error", error => stop(error));
    child.stdout.on("data", (bytes: Buffer) => { try { reader.push(bytes); } catch (error) { stop(error as Error); } });
    child.stdout.on("error", error => stop(error));
    child.on("close", code => {
      if (finished) return; finished = true; clearTimeout(timer);
      try { reader.finish(); } catch (error) { failure ??= error as Error; }
      if (failure || code !== 0 || !image) reject(failure ?? new Error("core-thumbnail-host-exited")); else resolve(image);
    });
    const request = Buffer.alloc(16 + encoded.length);
    request.writeUInt32LE(12 + encoded.length); request.writeUInt32LE(1, 4); request.writeUInt32LE(edge, 8);
    request.writeUInt32LE(sourcePath.length, 12); encoded.copy(request, 16); child.stdin.end(request);
  });
};
