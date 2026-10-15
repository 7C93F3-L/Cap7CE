import { app } from "electron";
import path from "node:path";
import { CatalogGridPreferenceStore } from "./catalogGridPreferenceStore";
import { isCatalogGridSize, readCatalogGridSizes } from "./catalogGridSizeRules";
import type { DirectoryRename } from "../src/shared/directoryRenameTypes";

export const catalogGridPreferences = new CatalogGridPreferenceStore(() => path.join(app.getPath("userData"), "config", "catalog-grid.json"));
export const catalogGridSizes = new CatalogGridPreferenceStore<number>(() => path.join(app.getPath("userData"), "config", "catalog-grid-sizes.json"), { read: readCatalogGridSizes, valid: isCatalogGridSize });
export async function relocateCatalogGridPreferences(change: DirectoryRename) {
  await catalogGridPreferences.relocate(change);
  await catalogGridSizes.relocate(change);
}
