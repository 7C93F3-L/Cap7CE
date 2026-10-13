import type { ComputerSearchItem } from "../../electron/computerSearchTypes";
export type { CatalogGridMode } from "./catalogGridPreferenceTypes";
export interface CatalogSelection {
  items: ComputerSearchItem[];
  taskId: string;
  openPreview: () => void;
}
