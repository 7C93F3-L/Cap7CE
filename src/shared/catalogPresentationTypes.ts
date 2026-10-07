import type { ComputerSearchItem } from "../../electron/computerSearchTypes";
export type CatalogGridMode = "square" | "gallery";
export interface CatalogSelection {
  items: ComputerSearchItem[];
  taskId: string;
  openPreview: () => void;
}
