import type { FileFormatCapability } from "../../electron/formatCapabilities";
import type { ComputerSearchFileConditions, ComputerSearchSort } from "./computerSearchFactTypes";

export type SkimBrowseEntryKind = "drive" | "folder" | "file";
export interface SkimBrowseEntry {
  kind: SkimBrowseEntryKind;
  name: string;
  path: string;
  extension: string;
  label?: string;
  size: number | null;
  modifiedAt: string | null;
  withinAddedDirectory: boolean;
  hidden: boolean;
  formatCapability?: FileFormatCapability;
  status: "ready" | "loading" | "error";
  error?: string;
  fileReference?: string;
}
export interface SkimBreadcrumb { name: string; path: string; }
export interface SkimReadResult { currentPath: string | null; breadcrumbs: SkimBreadcrumb[]; entries: SkimBrowseEntry[]; cancelled: boolean; }

export interface DirectoryBrowseOptions {
  sort: ComputerSearchSort;
  excludeHidden: boolean;
  fileConditions?: ComputerSearchFileConditions;
}
export interface DirectoryBrowsePage {
  entries: SkimBrowseEntry[];
  nextCursor: string | null;
  isComplete: boolean;
}
