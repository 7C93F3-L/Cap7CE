import { randomUUID } from "node:crypto";
import { validPreviewMetadata } from "./previewMetadataProjection";
import type { CancellablePreviewMetadataRead } from "../../src/shared/embeddedMetadataTypes";

interface Transport {
  request: (method: string, args: unknown[]) => Promise<unknown>;
  cancel: (method: string, args: unknown[]) => Promise<unknown>;
}
export const startCorePreviewMetadataRead = (filePath: string, timeoutMs = 8000, injected?: Transport): CancellablePreviewMetadataRead => {
  const id = randomUUID();
  let finished = false, sent = false, transport: Transport | undefined;
  let settle: (value: Awaited<CancellablePreviewMetadataRead["result"]>) => void = () => undefined;
  const result = new Promise<Awaited<CancellablePreviewMetadataRead["result"]>>(resolve => { settle = resolve; });
  const finish = (value: Awaited<CancellablePreviewMetadataRead["result"]>, cancel: boolean) => {
    if (finished) return;
    finished = true; clearTimeout(timer); settle(value);
    if (cancel && sent) void transport!.cancel("cancelPreviewMetadata", [id]).catch(() => undefined);
  };
  const timer = setTimeout(() => finish(null, true), Math.max(1, timeoutMs));
  void Promise.resolve().then(async () => {
    if (finished) return;
    if (injected) transport = injected;
    else {
      const service = await import("../visualCacheService");
      transport = { request: service.requestVisualCacheOwner, cancel: service.requestActiveVisualCacheOwner };
    }
    if (finished) return;
    sent = true;
    const value = await transport.request("previewMetadata", [id, filePath]);
    finish(validPreviewMetadata(value) ? value : null, false);
  }).catch(() => finish(null, true));
  return { result, cancel: () => finish(null, true) };
};
