import path from "node:path";
import type { Worker } from "node:worker_threads";
import { createPreviewWorker } from "../lifecycle";
import type { PsdPreviewInfo } from "../../../shared/psdPreviewTypes";

interface Pending { id: number; resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }
interface Session { id: string; file: string; worker: Worker; pending?: Pending; stopped: boolean; count: number }
const cancelled = () => Error("psd-preview-cancelled");
export function createPsdPreviewService(directory: string) {
  let active: Session | undefined, opening: string | undefined, generation = 0, sequence = 0;
  const revoked = new Set<string>();
  async function stop(session?: Session) {
    if (!session || session.stopped) return;
    session.stopped = true;
    if (session.pending) { clearTimeout(session.pending.timer); session.pending.reject(cancelled()); session.pending = undefined; }
    await session.worker.terminate();
  }
  async function close(id?: string) {
    if (id) { revoked.add(id); if (revoked.size > 64) revoked.delete(revoked.values().next().value!); }
    if (!id || opening === id) { ++generation; opening = undefined; }
    if (active && (!id || active.id === id)) { const old = active; active = undefined; await stop(old); }
  }
  function wait(session: Session, id: number, page?: number): Promise<unknown> {
    if (session.stopped || session.pending) return Promise.reject(Error("psd-preview-busy"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { void stop(session); }, id === 0 ? 15000 : 10000);
      session.pending = { id, resolve, reject, timer };
      if (page !== undefined) session.worker.postMessage({ id, page });
    });
  }
  async function open(id: string, file: string): Promise<PsdPreviewInfo> {
    if (revoked.has(id)) throw cancelled();
    const turn = ++generation; opening = id; const old = active; active = undefined; await stop(old);
    if (turn !== generation || revoked.has(id)) throw cancelled();
    const worker = createPreviewWorker(path.join(directory, "psd-preview.js"), { workerData: { file } });
    const session: Session = { id, file, worker, stopped: false, count: 0 }; active = session; opening = undefined;
    worker.on("message", message => {
      const pending = session.pending; if (!pending || session.stopped || message?.id !== pending.id) return;
      session.pending = undefined; clearTimeout(pending.timer);
      if (message.type === "error") { pending.reject(Error(String(message.error).slice(0, 512))); void stop(session); }
      else if (pending.id === 0 && message.type === "ready" && Array.isArray(message.pages) && message.pages.length >= 1 && message.pages.length <= 128
        && message.pages.every((p: { name: unknown; width: number; height: number }) => p && typeof p.name === "string" && p.name.length <= 128
          && Number.isSafeInteger(p.width) && p.width > 0 && Number.isSafeInteger(p.height) && p.height > 0)) {
        session.count = message.pages.length; pending.resolve({ pages: message.pages });
      } else if (pending.id > 0 && message.type === "page" && message.png instanceof Uint8Array && message.png.length <= 24 * 1024 * 1024
        && Buffer.from(message.png.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        pending.resolve({ base64: Buffer.from(message.png).toString("base64") });
      } else { pending.reject(Error("psd-preview-response")); void stop(session); }
    });
    worker.once("error", () => { void stop(session); }); worker.once("exit", () => { void stop(session); });
    return await wait(session, 0) as PsdPreviewInfo;
  }
  return {
    close,
    async dispatch(method: string, args: unknown[]) {
      if (args.length !== (method === "psd.open" ? 2 : 3) || typeof args[0] !== "string" || !args[0] || args[0].length > 32767
        || args[0].includes("\0") || typeof args[1] !== "string" || !path.isAbsolute(args[1]) || args[1].includes("\0") || args[1].length > 32767)
        throw Error("psd-preview-request");
      const [id, file] = args as [string, string];
      if (method === "psd.open") return open(id, file);
      if (method !== "psd.render" || !active || active.id !== id || active.file !== file || !Number.isSafeInteger(args[2])
        || (args[2] as number) < 0 || (args[2] as number) >= active.count) throw Error("psd-preview-session");
      return wait(active, ++sequence, args[2] as number);
    }
  };
}
