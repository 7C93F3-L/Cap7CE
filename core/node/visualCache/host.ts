import path from "node:path";
import { createVisualCacheDispatcher } from "./dispatch";
import { VisualCacheFrameReader, maximumCacheFrameBytes } from "../../../electron/core/visualCacheFrames";

// Private pipes only. EOF drains admitted cache work and exits; there is no idle polling or network listener.
const root = process.argv[2];
if (process.argv.length !== 3 || !root || !path.isAbsolute(root)) process.exit(2);
process.stdout.on("error", () => { process.exitCode = 1; process.stdin.destroy(); });
const dispatch = createVisualCacheDispatcher(root);
const pending = new Set<Promise<void>>();
let lastId = 0, pendingBytes = 0, output: Promise<void> = Promise.resolve(), transfers: Promise<void> = Promise.resolve();
const respond = (value: unknown) => {
  const payload = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4);
  if (payload.length > maximumCacheFrameBytes) throw new Error("core-cache-response-too-large");
  header.writeUInt32LE(payload.length);
  const frame = Buffer.concat([header, payload]);
  output = output.then(() => new Promise<void>((resolve, reject) => process.stdout.write(frame, error => error ? reject(error) : resolve())));
  return output;
};
const accept = (bytes: Buffer) => {
  const request = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes)) as Record<string, unknown>;
  if (!request || typeof request !== "object" || Object.keys(request).sort().join(",") !== "args,id,method,version"
    || request.version !== 1 || !Number.isSafeInteger(request.id) || (request.id as number) <= lastId || pending.size >= 64
    || pendingBytes + bytes.length > 2 * maximumCacheFrameBytes)
    throw new Error("core-cache-invalid-frame");
  lastId = request.id as number; pendingBytes += bytes.length;
  const execute = () => Promise.resolve().then(() => dispatch(request.method, request.args))
    .then(result => respond({ id: request.id, result: result ?? null }), error => respond({ id: request.id,
      error: { code: typeof error?.code === "string" ? error.code : "core-cache-operation-failed", message: String(error?.message ?? error).slice(0, 1024) } }))
    .catch(() => { process.exitCode = 1; process.stdin.destroy(); });
  const transfer = request.method === "read" || request.method === "write";
  const work = transfer ? transfers.then(execute, execute) : execute();
  if (transfer) transfers = work;
  const task = work.finally(() => { pending.delete(task); pendingBytes -= bytes.length; });
  pending.add(task);
};
async function run() {
  const reader = new VisualCacheFrameReader(accept);
  for await (const chunk of process.stdin) reader.push(chunk);
  reader.finish();
  await Promise.allSettled(pending); await output;
}
void run().catch(() => { process.exitCode = 1; process.stdin.destroy(); });
