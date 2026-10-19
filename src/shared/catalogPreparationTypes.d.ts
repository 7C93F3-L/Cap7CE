export interface CatalogPreparationProgress {
  volumeId: string;
  drive: string;
  stage: "preparing" | "scanning" | "publishing" | "syncing";
  processed: number;
  total: number | null;
  fraction: number | null;
  remainingSeconds: number | null;
}
