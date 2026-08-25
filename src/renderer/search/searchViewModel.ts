import { fileFormatCapabilities, skimCuratedFileExtensionSet, skimDefaultFileExtensionSet } from "../../../electron/formatCapabilities";
import type { ImageSearchResponse, SkimDisplayPreferences } from "../../shared/types";

export const getAbsoluteWindowsDirectoryInput = (input: string): string | null => {
  let candidate = input.trim();
  if (candidate.length >= 2 && candidate.startsWith('"') && candidate.endsWith('"')) candidate = candidate.slice(1, -1).trim();
  if (/^[\\/]{2}[?.][\\/]/.test(candidate)) return null;
  if (/^[a-z]:[\\/]/i.test(candidate)) return candidate;
  if (/^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/.test(candidate)) return candidate;
  return null;
};

export const getSearchDisplayExtensions = (display: SkimDisplayPreferences) => (
  display.searchMode === "all"
    ? [...skimCuratedFileExtensionSet]
    : display.searchMode === "custom" ? display.customExtensions : [...skimDefaultFileExtensionSet]
).filter((extension) => fileFormatCapabilities.some((capability) => capability.extension === extension && capability.canSearch));

export const emptySearchResponse: ImageSearchResponse = {
  images: [],
  availableFormats: []
};
