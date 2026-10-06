export type { MetadataBuildPhase, MetadataBuildProgress } from "../../src/shared/metadataBuildTypes";

// Bounded samples; an unknown workload or an unsampled kind produces no invented ETA.
export class MetadataBuildEstimate {
  private readonly samples = new Map<number, number[]>();
  add(kind: number, milliseconds: number): void {
    const values = this.samples.get(kind) ?? [];
    values.push(Math.max(1, milliseconds));
    if (values.length > 64) values.shift();
    this.samples.set(kind, values);
  }
  remaining(counts: ReadonlyMap<number, number>): number | null {
    if ([...this.samples.values()].reduce((sum, values) => sum + values.length, 0) < 8) return null;
    let milliseconds = 0;
    for (const [kind, count] of counts) {
      if (count <= 0) continue;
      const values = this.samples.get(kind);
      if (!values || values.length < 2) return null;
      milliseconds += count * values.reduce((sum, value) => sum + value, 0) / values.length;
    }
    return Math.ceil(milliseconds / 1000);
  }
}

export const metadataBuildDelay = (milliseconds: number, signal: AbortSignal): Promise<void> => {
  if (signal.aborted) return Promise.reject(new Error("metadata-build-cancelled"));
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(new Error("metadata-build-cancelled")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
};
