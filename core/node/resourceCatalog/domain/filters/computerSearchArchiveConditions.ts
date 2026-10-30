import type { SearchState } from "../../../../../src/shared/types";
import type { ComputerSearchConditions } from "../../../../../src/shared/computerSearchFactTypes";
import type { ComputerSearchArchiveFilter } from "../../../../../src/shared/computerSearchArchiveTypes";
import { toComputerSearchTextDataConditions } from "./computerSearchTextDataConditions";
const counts: Record<string, readonly [number, number?]> = { "under-10": [0, 9], "10-100": [10, 99], "100-1000": [100, 999], "over-1000": [1000] };
const invalid = (): never => { throw new Error("computer-search-invalid-archive-selection"); };
export const toComputerSearchArchiveConditions = (search: SearchState, referenceNow = new Date()): ComputerSearchConditions => {
  const result = toComputerSearchTextDataConditions(search, referenceNow);
  for (const value of [search.archiveContentTypes, search.archiveStructures]) if (value !== undefined && !Array.isArray(value)) return invalid();
  if (![search.archiveContentTypes, search.archiveStructures].some(value => value !== undefined && value.length)
    && search.archiveEntryCountPreset === undefined && search.archiveEntryCountRange === undefined) return result;
  if (result.facts) throw new Error("computer-search-mixed-media-conditions");
  const archive: ComputerSearchArchiveFilter = {};
  for (const [key, value, allowed] of [["contentTypes", search.archiveContentTypes, ["image", "video", "audio", "document", "project", "threeD", "program", "other"]],
    ["structures", search.archiveStructures, ["flat", "nested"]]] as const) if (value !== undefined && value.length) {
    if (!Array.isArray(value) || value.length > allowed.length || value.some(item => !allowed.some(choice => choice === item))) return invalid();
    Object.assign(archive, { [key]: [...value] });
  }
  const preset = search.archiveEntryCountPreset, range = search.archiveEntryCountRange;
  if (preset !== undefined && (typeof preset !== "string" || !Object.prototype.hasOwnProperty.call(counts, preset))) return invalid();
  let bounds: readonly [number?, number?] = typeof preset === "string" ? counts[preset] : [];
  if (range !== undefined) {
    if (!range || typeof range !== "object" || Array.isArray(range) || Object.keys(range).some(key => !["minCount", "maxCount"].includes(key))) return invalid();
    const { minCount: min, maxCount: max } = range;
    if ([min, max].some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 2_000_000_000))
      || min === undefined && max === undefined || min !== undefined && max !== undefined && min > max) return invalid();
    bounds = [min, max];
  }
  if (bounds[0] !== undefined) archive.minimumFileCount = bounds[0];
  if (bounds[1] !== undefined) archive.maximumFileCount = bounds[1];
  return { ...result, facts: { kind: "archive", archive } };
};
