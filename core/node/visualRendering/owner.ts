import type { VisualDecodeTask, VisualDecodeResult } from "../../../core/shared/visualRenderTypes";
import { VisualWorkerSlot } from "./workerSlot";

type Work = { kind: "task"; task: VisualDecodeTask; resolve: (value: VisualDecodeResult) => void; reject: (error: Error) => void }
  | { kind: "release"; resolve: () => void; reject: (error: Error) => void };
export class VisualExecutionOwner {
  private slots: { worker: VisualWorkerSlot; busy: boolean }[];
  private queue: Work[] = [];
  private closed = false;
  private releasing = false;
  constructor(directory: string, timeoutMs?: number, idleMs?: number) {
    this.slots = Array.from({ length: 2 }, () => ({ worker: new VisualWorkerSlot(directory, timeoutMs, idleMs), busy: false }));
  }
  execute(task: VisualDecodeTask): Promise<VisualDecodeResult> {
    if (this.closed || this.queue.length >= 64) return Promise.reject(new Error("core-visual-executor-unavailable"));
    return new Promise((resolve, reject) => { this.queue.push({ kind: "task", task: { ...task }, resolve, reject }); this.pump(); });
  }
  release(): Promise<void> {
    if (this.closed) return Promise.resolve();
    return new Promise((resolve, reject) => { this.queue.push({ kind: "release", resolve, reject }); this.pump(); });
  }
  close(): void {
    this.closed = true;
    for (const item of this.queue.splice(0)) item.reject(Object.assign(new Error("Visual execution was cancelled."), { code: "ECANCELED" }));
    for (const slot of this.slots) slot.worker.close();
  }
  private pump(): void {
    while (!this.closed && !this.releasing && this.queue.length) {
      const next = this.queue[0];
      if (next.kind === "release") {
        if (this.slots.some(slot => slot.busy)) return;
        this.queue.shift(); this.releasing = true;
        void Promise.all(this.slots.map(slot => slot.worker.closeAndWait())).then(() => next.resolve(), next.reject)
          .finally(() => { this.releasing = false; this.pump(); });
        return;
      }
      const slot = this.slots.find(slot => !slot.busy); if (!slot) return;
      this.queue.shift(); slot.busy = true;
      void Promise.resolve().then(() => {
        if (this.closed) throw Object.assign(new Error("Visual execution was cancelled."), { code: "ECANCELED" });
        return slot.worker.execute(next.task);
      }).then(next.resolve, next.reject).finally(() => { slot.busy = false; this.pump(); });
    }
  }
}
