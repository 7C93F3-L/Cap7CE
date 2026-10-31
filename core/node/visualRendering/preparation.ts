import type { VisualCacheType, VisualImageMimeType } from "../../../src/shared/visualCacheTypes";
import type { NativeVisualCacheType, VisualDecodeResult, VisualPreparedPath } from "../../../src/shared/visualRenderTypes";
import type { createVisualCacheStore } from "../visualCache/store";
import { detectVisualImageMimeType } from "../visualCache/contracts/visualCacheImage";
import { requestCoreShellThumbnail } from "../../../electron/core/coreShellThumbnail";
import { VisualExecutionOwner } from "./owner";
import { visualNativeExecutable } from "./resources";

type Store = ReturnType<typeof createVisualCacheStore>;
const image = (value: VisualDecodeResult) => {
  if (value.kind !== "image") throw new Error("core-visual-worker-invalid-response");
  const buffer = Buffer.from(value.base64, "base64");
  if (detectVisualImageMimeType(buffer) !== value.mimeType) throw new Error("core-visual-worker-invalid-response");
  return { buffer, mimeType: value.mimeType };
};
export class CoreVisualPreparation {
  private readonly source: VisualExecutionOwner;
  private readonly pending = new Map<string, Promise<VisualPreparedPath>>();
  private nativeSerial: Promise<unknown> = Promise.resolve();
  private operations = new Set<Promise<unknown>>();
  private closed = false;
  constructor(private readonly store: Store, directory: string) { this.source = new VisualExecutionOwner(directory); }
  ensure(sourcePath: string, type: VisualCacheType, shell: boolean) { return this.track(this.ensurePath(sourcePath, type, shell)); }
  private async ensurePath(sourcePath: string, type: VisualCacheType, shell: boolean) {
    const isShell = type.includes("-shell-");
    if (isShell !== shell) throw new Error("Shell 图像必须使用独立 Provider。");
    await this.store.initializeVisualCacheDirectories();
    const entry = await this.store.createVisualCacheEntry(sourcePath, type);
    const result = { imagePath: entry.imagePath, fileSize: entry.fileSize, modifiedMs: entry.modifiedMs };
    if (await this.store.isVisualCacheEntryValid(entry)) return result;
    const key = `${type}:${entry.key}`, pending = this.pending.get(key); if (pending) return pending;
    const work = (async () => {
      try {
        let prepared: { buffer: Buffer; mimeType: VisualImageMimeType };
        if (shell) {
          const native = this.nativeSerial.then(() => {
            if (this.closed) throw Object.assign(new Error("Visual preparation cancelled."), { code: "ECANCELED" });
            return requestCoreShellThumbnail(entry.sourcePath, type.endsWith("preview") ? 1200 : 300, visualNativeExecutable());
          });
          this.nativeSerial = native.catch(() => undefined);
          prepared = { buffer: await native, mimeType: "image/png" };
        } else prepared = image(await this.source.execute({ operation: "decode", sourcePath: entry.sourcePath, type: type as NativeVisualCacheType }));
        await this.store.writeVisualCacheEntry(entry, prepared.buffer, prepared.mimeType); return result;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ECANCELED" || shell) throw error;
        throw Object.assign(new Error(`${type} 生成失败：${(error as Error)?.message ?? "未知渲染错误"}`), { code: (error as NodeJS.ErrnoException).code });
      }
    })().finally(() => this.pending.delete(key));
    this.pending.set(key, work); return work;
  }
  temporary(sourcePath: string) { return this.track(this.prepareTemporary(sourcePath)); }
  private async prepareTemporary(sourcePath: string) {
    await this.store.createVisualCacheEntry(sourcePath, "model-input-image"); // Preserve ordinary-file metadata validation without publishing anything.
    const prepared = image(await this.source.execute({ operation: "decode", sourcePath, type: "model-input-image" }));
    return { base64: prepared.buffer.toString("base64"), mimeType: prepared.mimeType };
  }
  async dimensions(sourcePath: string) {
    const result = await this.source.execute({ operation: "dimensions", sourcePath });
    if (result.kind !== "dimensions") throw new Error("core-visual-worker-invalid-response"); return result.value;
  }
  async sourcePreview(sourcePath: string) {
    const result = await this.source.execute({ operation: "sourcePreview", sourcePath });
    if (result.kind !== "sourcePreview") throw new Error("core-visual-worker-invalid-response"); return result.value;
  }
  async release(): Promise<void> {
    await Promise.allSettled([...this.operations]);
    await Promise.all([this.source.release(), this.nativeSerial]);
  }
  close(): void { this.closed = true; this.source.close(); }
  private track<T>(operation: Promise<T>): Promise<T> {
    this.operations.add(operation);
    void operation.finally(() => this.operations.delete(operation)).catch(() => undefined);
    return operation;
  }
}
