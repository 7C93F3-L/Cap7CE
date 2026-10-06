import type { CatalogMaintenanceNotice } from "../../src/shared/catalogMaintenanceTypes";

type Protocol = { wait(sequence: number, signal: AbortSignal): Promise<CatalogMaintenanceNotice> };

// Owns one authenticated long wait per Host process. Observing the same process
// does not retry failures; stop joins the response before the Host can close.
export class CoreCatalogChangeWatcher {
  private processId?: number;
  private cancellation?: AbortController;
  private running?: Promise<void>;
  private lifecycle: Promise<void> = Promise.resolve();
  private failed = false;
  constructor(private readonly protocol: Protocol,
    private readonly onNotice: (notice: CatalogMaintenanceNotice) => void) {}

  observe(processId: number | undefined, supported: boolean): Promise<void> {
    return this.serialize(async () => {
      const next = supported && Number.isSafeInteger(processId) && processId! > 0 ? processId : undefined;
      if (next === this.processId) return;
      await this.retire();
      this.processId = next; this.failed = false;
      if (next === undefined) return;
      const cancellation = new AbortController(); this.cancellation = cancellation;
      this.running = this.watch(cancellation.signal).catch(() => {
        if (!cancellation.signal.aborted) this.failed = true;
      });
    });
  }
  hasFailed(): boolean { return this.failed; }
  stop(): Promise<void> {
    return this.serialize(async () => { await this.retire(); this.processId = undefined; this.failed = false; });
  }
  private serialize(action: () => Promise<void>): Promise<void> {
    const pending = this.lifecycle.then(action);
    this.lifecycle = pending.catch(() => undefined); return pending;
  }
  private async retire(): Promise<void> {
    this.cancellation?.abort(); await this.running;
    this.cancellation = undefined; this.running = undefined;
  }
  private async watch(signal: AbortSignal): Promise<void> {
    let sequence = 0;
    while (!signal.aborted) {
      const notice = await this.protocol.wait(sequence, signal);
      signal.throwIfAborted(); sequence = notice.sequence;
      if (notice.changed) this.onNotice(notice);
    }
  }
}
