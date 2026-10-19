import { app } from "electron";
import path from "node:path";
export const officePreviewTempRoot = app.getPath("temp");
export const officePreviewRoot = path.join(officePreviewTempRoot, "Cap7CE", "office-preview");
export const officePreviewCacheRoot = path.join(officePreviewRoot, "cache");
