export type CatalogMaintenanceState = "idle" | "starting" | "watching" | "paused" | "unavailable" | "failed" | "stopped";
export type CatalogMaintenanceReason = "reader-wait-unavailable" | "reader-entry-names-unavailable" | "owned-storage-unavailable" | "reader-monitor-failed";
export interface CatalogMaintenanceNotice {
  sequence: number;
  catalogRevision: number;
  state: CatalogMaintenanceState;
  reason: CatalogMaintenanceReason | null;
  changed: boolean;
}
