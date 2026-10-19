import { Worker } from "node:worker_threads";
import path from "node:path";
import { validPreviewMetadata } from "../../../electron/core/previewMetadataProjection";
import type { PreviewEmbeddedMetadata } from "../../../src/shared/embeddedMetadataTypes";

interface Job { id: string; source: string; resolve: (value: PreviewEmbeddedMetadata | null) => void; worker?: Worker; timer?: NodeJS.Timeout; ending?: Promise<void> }
export class InteractiveMetadataOwner {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: Job[] = [];
  private active = 0;
  private closed = false;
  private releasing?: Promise<void>;
  constructor(private readonly directory: string, private readonly timeoutMs = 8000) {}
  read(id: string, source: string): Promise<PreviewEmbeddedMetadata | null> {
    if (this.closed || this.releasing || this.jobs.has(id) || this.jobs.size >= 4) return Promise.resolve(null);
    return new Promise(resolve => { const job: Job = { id, source, resolve }; this.jobs.set(id, job); this.queue.push(job); this.pump(); });
  }
  cancel(id: string): Promise<void> { const job = this.jobs.get(id); return job ? this.finish(job, null) : Promise.resolve(); }
  release(): Promise<void> {
    return this.releasing ??= Promise.all([...this.jobs.values()].map(job => this.finish(job, null)))
      .then(() => undefined).finally(() => { this.releasing = undefined; });
  }
  close(): void { this.closed = true; void this.release(); }
  private pump(): void {
    while (!this.closed && !this.releasing && this.active < 2 && this.queue.length) {
      const job = this.queue.shift()!;
      if (!this.jobs.has(job.id) || job.ending) continue;
      try {
        const worker = new Worker(path.join(this.directory, "preview-metadata.cjs"), { workerData: job.source, execArgv: [], stdout: true, stderr: true,
          resourceLimits: { maxOldGenerationSizeMb: 256, stackSizeMb: 4 } });
        worker.stdout!.resume(); worker.stderr!.resume();
        job.worker = worker; this.active++;
        job.timer = setTimeout(() => { void this.finish(job, null); }, this.timeoutMs);
        worker.once("message", value => { void this.finish(job, validPreviewMetadata(value) ? value : null); });
        worker.once("error", () => { void this.finish(job, null); });
        worker.once("exit", () => { void this.finish(job, null); });
      } catch { void this.finish(job, null); }
    }
  }
  private finish(job: Job, value: PreviewEmbeddedMetadata | null): Promise<void> {
    if (job.ending) return job.ending;
    clearTimeout(job.timer);
    const index = this.queue.indexOf(job); if (index !== -1) this.queue.splice(index, 1);
    // Keep the slot occupied until termination actually releases source handles.
    job.ending = Promise.resolve().then(() => job.worker?.terminate()).catch(() => undefined).then(() => {
      if (job.worker) this.active--;
      this.jobs.delete(job.id); job.resolve(value); this.pump();
    });
    return job.ending;
  }
}
