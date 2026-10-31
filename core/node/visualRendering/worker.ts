import { VisualCacheFrameReader, maximumCacheImageBytes, maximumCacheFrameBytes } from "../../../electron/core/visualCacheFrames";
import type { VisualDecodeTask, VisualDecodeResult } from "../../../src/shared/visualRenderTypes";
import path from "node:path";

for (const method of ["log", "info", "debug", "warn", "error"] as const) console[method] = () => undefined;
process.stdout.on("error", () => process.exit(1));
const source = (value: unknown): string => typeof value === "string" && value.length > 0 && value.length <= 32767 && !value.includes("\0") && path.isAbsolute(value) ? value : (() => { throw new Error("core-visual-invalid-source"); })();
let lastId = 0, serial: Promise<void> = Promise.resolve();
const execute = async (task: VisualDecodeTask): Promise<VisualDecodeResult> => {
  if (!task || typeof task !== "object" || Object.keys(task).sort().join(",") !== (task.operation === "decode" ? "operation,sourcePath,type" : "operation,sourcePath"))
    throw new Error("core-visual-invalid-task");
  const sourcePath = source(task.sourcePath);
  if (task.operation === "dimensions") return { kind: "dimensions", value: await (await import("../fileFacts/domain/visualSourceDimensions")).readVisualSourceDimensions(sourcePath) };
  if (task.operation === "sourcePreview") return { kind: "sourcePreview", value: await (await import("./directPreview")).shouldUseSourceFileForPreview(sourcePath) };
  if (task.operation !== "decode") throw new Error("core-visual-invalid-operation");
  const image = await (await import("./renderSource")).decodeVisualSource(sourcePath, task.type);
  if (!image.buffer.length || image.buffer.length > maximumCacheImageBytes) throw new Error("core-visual-image-too-large");
  return { kind: "image", base64: image.buffer.toString("base64"), mimeType: image.mimeType };
};
const respond = async (value: unknown) => {
  const payload = Buffer.from(JSON.stringify(value)); if (payload.length > maximumCacheFrameBytes) throw new Error("core-visual-response-too-large");
  const header = Buffer.alloc(4); header.writeUInt32LE(payload.length);
  await new Promise<void>((resolve, reject) => process.stdout.write(Buffer.concat([header, payload]), error => error ? reject(error) : resolve()));
};
const reader = new VisualCacheFrameReader(bytes => {
  const request = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
  if (bytes.length > 256 * 1024 || !request || request.version !== 1 || !Number.isSafeInteger(request.id) || request.id <= lastId
    || Object.keys(request).sort().join(",") !== "id,task,version") throw new Error("core-visual-invalid-frame");
  lastId = request.id;
  serial = serial.then(async () => {
    try { await respond({ id: request.id, result: await execute(request.task), rssBytes: process.memoryUsage().rss }); }
    catch (error) { await respond({ id: request.id, error: { message: String((error as Error)?.message ?? error).slice(0, 1024), code: "core-visual-source-failed" }, rssBytes: process.memoryUsage().rss }); }
  }).catch(() => process.exit(1));
});
process.stdin.on("data", (bytes: Buffer) => { try { reader.push(bytes); } catch { process.exit(2); } });
// EOF means the owning cache process is gone; do not leave synchronous parsers or artboard threads behind.
process.stdin.on("end", () => process.exit(0));
