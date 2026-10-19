import path from "node:path";
import { InteractiveMetadataOwner } from "../interactiveMetadata/owner";
import { validTextPreviewReply } from "../../../electron/core/coreTextPreviewProjection";
import type { TextPreviewReply } from "../../../src/shared/textPreviewTypes";
const fallback: TextPreviewReply = { ok: false, error: { code: "ECANCELED", message: "Text preview stopped." } };
export function createTextPreviewOwner(directory: string) {
  const worker = new InteractiveMetadataOwner(directory, 10000);
  return {
    async dispatch(method: string, args: unknown[]): Promise<unknown> {
      if (!Array.isArray(args) || typeof args[0] !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(args[0])) throw Error("core-text-preview-invalid-request");
      if (method === "text.cancel" && args.length === 1) { await worker.cancel(args[0]); return null; }
      if (method !== "text.read" || args.length !== 2 || typeof args[1] !== "string" || args[1].length > 32767 || args[1].includes("\0") || !path.isAbsolute(args[1])) throw Error("core-text-preview-invalid-request");
      return worker.run(args[0], "text-preview.cjs", args[1], validTextPreviewReply, fallback);
    },
    release: () => worker.release(),
    async close() { worker.close(); await worker.release(); }
  };
}
