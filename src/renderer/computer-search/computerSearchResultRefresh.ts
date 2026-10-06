import type { ComputerSearchPage, ComputerSearchRequest, ComputerSearchNextPageRequest } from "../../../electron/computerSearchTypes";
import type { MetadataBuildProgress } from "../../shared/metadataBuildTypes";

// A replacement uses only its own signed cursors. The caller keeps the previous
// authorization session alive until this complete replacement can be committed.
export async function readComputerSearchReplacement(api: {
  search(request: ComputerSearchRequest): Promise<ComputerSearchPage>;
  nextPage(request: ComputerSearchNextPageRequest): Promise<ComputerSearchPage>;
}, request: ComputerSearchRequest, loadedCount: number, isCurrent: () => boolean) {
  let page = await api.search(request);
  if (!isCurrent()) return null;
  const items = [...page.items];
  const cursors = new Set<string>();
  while (page.nextCursor && items.length < loadedCount) {
    if (cursors.has(page.nextCursor)) throw new Error("computer-search-repeated-cursor");
    cursors.add(page.nextCursor);
    page = await api.nextPage({ taskId: request.taskId, cursor: page.nextCursor });
    if (!isCurrent()) return null;
    if (!page.items.length && page.nextCursor) throw new Error("computer-search-empty-page");
    items.push(...page.items);
  }
  return { ...page, items };
}

// Driven by observed build changes, with no timer once the pending update is
// acknowledged. A terminal update bypasses the normal five-second throttle.
export class MetadataResultRefreshGate {
  private observed: string | null = null;
  private phase: MetadataBuildProgress["phase"] | null = null;
  private completed = false;
  private sequence = 0;
  private pending: { stamp: string; terminal: boolean; attempts: number } | null = null;
  private lastAttempt = -Infinity;
  private catalogRevision: number | null = null;

  observeCatalog(revision: number) {
    if (!Number.isSafeInteger(revision) || revision < 0) return;
    if (this.catalogRevision !== null && revision !== this.catalogRevision)
      this.pending = { stamp: String(++this.sequence), terminal: false, attempts: 0 };
    this.catalogRevision = revision;
  }

  observe(progress: MetadataBuildProgress) {
    const terminal = ["completed", "paused", "failed"].includes(progress.phase);
    const stamp = `${progress.processed}:${progress.failed}:${progress.unsupported}`;
    const changed = this.observed !== null && this.observed !== stamp;
    const finished = progress.phase === "completed" && !this.completed && this.phase !== null;
    if (changed || finished) this.pending = { stamp: String(++this.sequence), terminal, attempts: 0 };
    else if (terminal && this.pending) this.pending.terminal = true;
    this.observed = stamp;
    this.phase = progress.phase;
    this.completed = progress.phase === "completed";
  }

  next(now: number) {
    const pending = this.pending;
    if (!pending || pending.attempts >= 3) return null;
    return { stamp: pending.stamp, delay: pending.terminal && pending.attempts === 0 ? 0
      : Math.max(0, this.lastAttempt + 5000 - now) };
  }

  finish(stamp: string, now: number, outcome: "applied" | "failed" | "deferred") {
    if (outcome === "deferred") return;
    this.lastAttempt = now;
    if (this.pending?.stamp !== stamp) return;
    if (outcome === "applied") this.pending = null;
    else this.pending.attempts++;
  }
}
