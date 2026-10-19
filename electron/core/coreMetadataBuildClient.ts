import type { MetadataBuildPolicy, MetadataBuildStatus, MetadataDirectoryStorageError } from "../../src/shared/metadataBuildTypes";
import { readMetadataBuildAck, readMetadataBuildScope, readMetadataBuildStatus, unwrapMetadataBuildReply, validMetadataStorageError } from "./coreMetadataBuildValidation";

interface Dependencies {
  request<T>(operation: string, body: Record<string, unknown>, deadlineMs?: number): Promise<T>;
  ensureCatalog(): Promise<unknown>; supports(operation: string): boolean; processId(): number | null;
  active(): boolean; reportStorageError?(error: MetadataDirectoryStorageError): void;
}
// Shell owns only startup, action forwarding and retired-process response rejection. No grant/configuration or background loop.
export class CoreMetadataBuildClient {
  private attachedPid: number | null = null;
  private attaching?: { pid: number; work: Promise<void> };
  private restoring?: { pid: number | null; work: Promise<void> };
  private stopping?: Promise<void>;
  private closed = false;
  constructor(private readonly dependencies: Dependencies) {}
  private current(pid: number) { return !this.closed && this.dependencies.active() && this.dependencies.processId() === pid; }
  private async ensure(): Promise<number> {
    if (this.closed || !this.dependencies.active()) throw new Error("metadata-build-start-cancelled");
    await this.dependencies.ensureCatalog(); const pid = this.dependencies.processId();
    if (!pid || !this.current(pid)) throw new Error("metadata-build-start-cancelled");
    if (!this.dependencies.supports("metadata.build.attach")) throw new Error("metadata-build-unavailable");
    if (this.attachedPid !== pid) {
      if (this.attaching?.pid !== pid) {
        const work = (async () => {
          readMetadataBuildAck(await this.raw("attach", {}, 30000), "attached");
          if (!this.current(pid)) throw new Error("metadata-build-start-cancelled"); this.attachedPid = pid;
        })();
        this.attaching = { pid, work };
      }
      const own = this.attaching;
      try { await own.work; } finally { if (this.attaching === own) this.attaching = undefined; }
    }
    if (!this.current(pid)) throw new Error("metadata-build-start-cancelled"); return pid;
  }
  private async raw(operation: string, body: Record<string, unknown>, deadline = 30000): Promise<unknown> {
    try { return unwrapMetadataBuildReply(await this.dependencies.request(`metadata.build.${operation}`, body, deadline)); }
    catch (error) {
      const details = (error as { details?: unknown })?.details;
      if (validMetadataStorageError(details)) { try { this.dependencies.reportStorageError?.(details); } catch { /* Diagnostics do not alter control. */ } }
      throw error;
    }
  }
  private async call(operation: string, body: Record<string, unknown> = {}): Promise<unknown> {
    const pid = await this.ensure(); const result = await this.raw(operation, body);
    if (!this.current(pid)) throw new Error("metadata-build-start-cancelled"); return result;
  }
  private async statusCall(operation: string, body: Record<string, unknown> = {}): Promise<MetadataBuildStatus> { return readMetadataBuildStatus(await this.call(operation, body)); }
  status() { return this.statusCall("status"); }
  async resolveScope(path: string) { return readMetadataBuildScope(await this.call("resolveScope", { path })); }
  savePolicy(policy: MetadataBuildPolicy) { return this.statusCall("savePolicy", { policy }); }
  start(request: { allowMetadataExtraction: boolean; policy: MetadataBuildPolicy }) { return this.statusCall("start", request); }
  pause() { return this.statusCall("pause"); }
  resume() { return this.statusCall("resume"); }
  startDirectory(request: { path: string; allowMetadataExtraction: boolean }) { return this.statusCall("startDirectory", request); }
  startAllVolumes(request: { allowMetadataExtraction: boolean }) { return this.statusCall("startAllVolumes", request); }
  cancelDirectories() { return this.statusCall("cancelDirectories"); }
  restore(): Promise<void> {
    if (this.closed || !this.dependencies.active()) return Promise.resolve();
    const pid = this.dependencies.processId();
    if (this.restoring?.pid === pid) return this.restoring.work;
    const own = { pid, work: Promise.resolve() };
    own.work = this.call("restore").then(value => readMetadataBuildAck(value)).finally(() => { if (this.restoring === own) this.restoring = undefined; });
    this.restoring = own; return own.work;
  }
  async notifyCatalogChange(): Promise<void> {
    const pid = this.attachedPid;
    if (!pid || !this.current(pid) || !this.dependencies.supports("metadata.build.notify")) return;
    const result = await this.raw("notify", {}); if (this.current(pid)) readMetadataBuildAck(result);
  }
  shutdown(): Promise<void> {
    if (this.stopping) return this.stopping;
    const pid = this.attachedPid; this.closed = true;
    return this.stopping = (async () => {
      if (!pid || this.dependencies.processId() !== pid || !this.dependencies.supports("metadata.build.shutdown")) return;
      readMetadataBuildAck(await this.raw("shutdown", {}));
    })();
  }
}
