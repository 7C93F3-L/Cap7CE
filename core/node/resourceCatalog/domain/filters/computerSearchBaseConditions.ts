import type { SearchState } from "../../../../../src/shared/types";
import type { ComputerSearchFileConditions } from "../../../../../src/shared/computerSearchFactTypes";
import { normalizeFileSizeRange, resolveSearchFileSizeFilter, searchFileSizePresets } from "../formats/fileSizeSearchFilters";
import { resolveSearchModifiedTimeRange } from "../formats/searchFilters";
import { fileFormatCapabilities } from "../formats/formatCapabilities";
import { getExtensionsForCanonicalFormat } from "../formats/exploreFormatFilters";

type BaseSelection = Pick<SearchState, "fileFormat" | "includedExtensions" | "selectedExtensions" | "unclassifiedOnly"
  | "timePreset" | "modifiedTimeRange" | "fileSizePreset" | "fileSizeRange">;
const epoch = 116444736000000000n;
const fileTime = (milliseconds: number): bigint => {
  if (!Number.isSafeInteger(milliseconds)) throw new Error("computer-search-invalid-date");
  const ticks = BigInt(milliseconds) * 10000n + epoch;
  if (ticks < 0n || ticks > 9223372036854775807n) throw new Error("computer-search-invalid-date");
  return ticks;
};

// Date ends and preset size ends are exclusive in the existing UI. Core ranges are inclusive.
export const toComputerSearchBaseConditions = (search: BaseSelection, referenceNow = new Date()): ComputerSearchFileConditions | undefined => {
  const result: ComputerSearchFileConditions = {};
  let extensions: string[] | undefined;
  const restrict = (values: readonly string[]) => {
    const normalized = [...new Set(values.map(value => value.toLowerCase()))];
    extensions = extensions ? extensions.filter(value => normalized.includes(value)) : normalized;
  };
  if (search.includedExtensions !== undefined) restrict(search.includedExtensions);
  if (search.selectedExtensions !== undefined) restrict(search.selectedExtensions);
  if (search.fileFormat !== "all") {
    const format = search.fileFormat.trim().replace(/^\./, "").toLowerCase();
    const aliases = getExtensionsForCanonicalFormat(format);
    restrict(aliases.length ? aliases : [`.${format}`]);
  }
  if (extensions !== undefined) result.extensions = extensions;
  if (search.unclassifiedOnly) result.excludedExtensions = fileFormatCapabilities.filter(value => value.canSearch).map(value => value.extension);
  if (search.fileSizeRange && !normalizeFileSizeRange(search.fileSizeRange)) throw new Error("computer-search-invalid-size");
  if (!search.fileSizeRange && search.fileSizePreset && !searchFileSizePresets.includes(search.fileSizePreset))
    throw new Error("computer-search-invalid-size");
  const size = resolveSearchFileSizeFilter(search.fileSizePreset, search.fileSizeRange);
  if (size?.minBytes !== undefined) result.minimumSizeBytes = size.minBytes;
  if (size?.maxBytes !== undefined) result.maximumSizeBytes = size.maxBytes - Number(!size.maximumInclusive);
  const time = resolveSearchModifiedTimeRange(search.timePreset, search.modifiedTimeRange, referenceNow);
  if (search.timePreset && !["week", "month", "year", "last-year", "older", "all", "custom"].includes(search.timePreset))
    throw new Error("computer-search-invalid-date");
  if (search.timePreset === "custom" && !time) throw new Error("computer-search-invalid-date");
  if (time) {
    result.minimumModifiedFileTime = fileTime(time.startMs).toString();
    result.maximumModifiedFileTime = (fileTime(time.endMs) - 1n).toString();
  }
  return Object.keys(result).length ? result : undefined;
};
