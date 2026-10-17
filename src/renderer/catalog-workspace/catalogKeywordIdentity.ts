import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
export const catalogKeywordKey = (item: ComputerSearchItem) =>
  `${item.volumeId ?? ""}:${item.fileReference ?? item.path}:${item.createdFileTimeMilliseconds ?? item.createdUtcTicks ?? ""}`;
export const catalogKeywordSelectionKey = (items: ComputerSearchItem[]) => items.filter(item => !item.isDirectory).map(catalogKeywordKey).sort().join("|");
