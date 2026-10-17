import type { ComputerSearchItem } from "../../electron/computerSearchTypes";
export type { CatalogGridMode } from "./catalogGridPreferenceTypes";
export interface CatalogSelection {
  items: ComputerSearchItem[];
  taskId: string;
  openPreview: () => void;
}

export interface CatalogRandomBrowseState {
  enabled: boolean;
  seed: number;
  batchNumber: number;
  toggle: () => void;
  disable: () => void;
  next: () => void;
}
