import type { CoreMetadataPolicy } from "../core/coreMetadataProtocol";
import type { MetadataBuildController } from "./metadataBuildController";

type Controller = Pick<MetadataBuildController, "waitForIdle" | "startChanges" | "hasPendingChanges">;

// Coalesces event wakes while a sweep/extraction is running. Reset revokes
// queued wakes immediately; the lifecycle separately cancels active extraction.
export class MetadataChangeDrain {
  private pending = false;
  private running?: Promise<void>;
  private epoch = 0;
  constructor(private readonly controller: Controller,
    private readonly policy: () => CoreMetadataPolicy | null, private readonly onFailure: () => void) {}
  notify(): void {
    this.pending = true;
    if (this.running) return;
    const epoch = this.epoch;
    this.running = this.run(epoch).catch(() => {
      if (epoch === this.epoch) { this.pending = false; this.onFailure(); }
    }).finally(() => {
      this.running = undefined;
      if (this.pending) this.notify();
    });
  }
  reset(): void { this.epoch++; this.pending = false; }
  async waitForIdle(): Promise<void> { while (this.running) await this.running; }
  private async run(epoch: number): Promise<void> {
    while (this.pending && epoch === this.epoch) {
      this.pending = false;
      await this.controller.waitForIdle();
      if (epoch !== this.epoch) return;
      const selected = this.policy();
      if (!selected) return;
      this.controller.startChanges(selected, true);
      const progress = await this.controller.waitForIdle();
      if (epoch !== this.epoch) return;
      if (progress.phase !== "completed") { this.pending = false; return; }
      if (this.controller.hasPendingChanges()) this.pending = true;
    }
  }
}
