import type { ComputerSearchSort } from "./computerSearchFactTypes";
export interface CatalogViewOptions { sort: ComputerSearchSort; showHidden: boolean; includeSubfolders: boolean; }
export type CatalogViewPreference = Partial<CatalogViewOptions>;
export type CatalogViewPreferenceMap = Record<string, CatalogViewPreference>;
