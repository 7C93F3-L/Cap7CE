import { inspectCoreSource, createCoreFolderStatsTask } from "./core/coreSourceInformationClient";
import type { SkimFolderStats, FolderStatsOptions } from "../src/shared/sourceInformationTypes";
export type { SkimPreviewInfo, SkimFolderStats } from "../src/shared/sourceInformationTypes";
export { isPathWithinDirectory } from "./sourcePathPolicy";
export { createCoreFolderStatsTask as createSkimFolderStatsTask } from "./core/coreSourceInformationClient";
export const inspectSkimEntry = inspectCoreSource;
export const collectSkimFolderStats = (rootPath: string, shouldCancel: () => boolean, onProgress: (stats: SkimFolderStats) => void, options: FolderStatsOptions = {}) => createCoreFolderStatsTask({ path: rootPath }, options).collect(onProgress, shouldCancel);
