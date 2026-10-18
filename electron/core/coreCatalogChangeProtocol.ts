import type { CoreProtocolClient } from "./coreProtocolClient";
import type { CatalogMaintenanceNotice } from "../../src/shared/catalogMaintenanceTypes";
import { requestCore } from "./coreAbortableRequest";

type Client = Pick<CoreProtocolClient, "request" | "startRequest" | "cancel">;
const states = new Set(["idle", "starting", "watching", "paused", "unavailable", "failed", "stopped"]);
const reasons = new Set(["reader-wait-unavailable", "reader-entry-names-unavailable", "owned-storage-unavailable", "reader-monitor-failed"]);
const safe = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;

export class CoreCatalogChangeProtocol {
  constructor(private readonly client: Client) {}
  async wait(afterSequence: number, signal: AbortSignal): Promise<CatalogMaintenanceNotice> {
    if (!safe(afterSequence)) throw new Error("core-catalog-invalid-sequence");
    const value = await requestCore<unknown>(this.client, "catalog.awaitChanges", { afterSequence, waitMilliseconds: 25_000 }, 30_000, signal);
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("core-catalog-invalid-notice");
    const notice = value as Record<string, unknown>;
    if (Object.keys(notice).length !== 5 || !safe(notice.sequence) || !safe(notice.catalogRevision)
      || typeof notice.state !== "string" || !states.has(notice.state)
      || (notice.reason !== null && (typeof notice.reason !== "string" || !reasons.has(notice.reason)))
      || typeof notice.changed !== "boolean" || notice.changed !== (notice.sequence !== afterSequence)) throw new Error("core-catalog-invalid-notice");
    return value as CatalogMaintenanceNotice;
  }
}
