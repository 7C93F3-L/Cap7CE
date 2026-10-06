import type { SearchState } from "../../shared/types";
import type { ComputerSearchConditions } from "../../shared/computerSearchFactTypes";
import type { ComputerSearchDocumentFilter } from "../../shared/computerSearchDocumentTypes";
import { normalizeDocumentContentCountRange, searchDocumentContentCountPresets, searchDocumentImageCompositions } from "../../../electron/documentSearchFilters";
import { searchArtboardCountPresets } from "../../../electron/artboardSearchFilters";
import { normalizeSearchCountRange } from "../../../electron/textDataSearchFilters";
import { toComputerSearchModelConditions } from "./computerSearchModelConditions";
const content: Record<string, [number, number?]> = { one: [1, 1], "2-10": [2, 10], "11-50": [11, 50], "51-100": [51, 100], "over-100": [101] };
const artboards: Record<string, [number, number?]> = { one: [1, 1], "2-5": [2, 5], "6-10": [6, 10], "11-20": [11, 20], "over-20": [21] };
const invalid = (): never => { throw new Error("computer-search-invalid-document-selection"); };
const validateRange = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const range = value as Record<string, unknown>;
  if (Object.keys(range).some(key => !["minCount", "maxCount"].includes(key))
    || [range.minCount, range.maxCount].some(count => count !== undefined && !Number.isSafeInteger(count))) return invalid();
};
export const toComputerSearchDocumentConditions = (search: SearchState, referenceNow = new Date()): ComputerSearchConditions => {
  const result = toComputerSearchModelConditions(search, referenceNow), document: ComputerSearchDocumentFilter = {};
  if (search.documentContentCountPreset !== undefined && !searchDocumentContentCountPresets.some(value => value === search.documentContentCountPreset)) return invalid();
  if (search.artboardCountPreset !== undefined && !searchArtboardCountPresets.some(value => value === search.artboardCountPreset)) return invalid();
  if (search.documentImageComposition !== undefined && !searchDocumentImageCompositions.some(value => value === search.documentImageComposition)) return invalid();
  if (search.documentContentCountRange !== undefined) {
    validateRange(search.documentContentCountRange);
    const range = normalizeDocumentContentCountRange(search.documentContentCountRange); if (!range) return invalid();
    if (range.minCount !== undefined) document.minimumContentCount = range.minCount;
    if (range.maxCount !== undefined) document.maximumContentCount = range.maxCount;
  } else if (search.documentContentCountPreset) {
    const [min, max] = content[search.documentContentCountPreset]; document.minimumContentCount = min;
    if (max !== undefined) document.maximumContentCount = max;
  }
  if (search.artboardCountRange !== undefined) {
    validateRange(search.artboardCountRange);
    const range = normalizeSearchCountRange(search.artboardCountRange); if (!range) return invalid();
    if (range.minCount !== undefined) document.minimumArtboardCount = range.minCount;
    if (range.maxCount !== undefined) document.maximumArtboardCount = range.maxCount;
  } else if (search.artboardCountPreset) {
    const [min, max] = artboards[search.artboardCountPreset]; document.minimumArtboardCount = min;
    if (max !== undefined) document.maximumArtboardCount = max;
  }
  if (search.documentImageComposition) document.hasEmbeddedImages = search.documentImageComposition === "with-images";
  if (!Object.keys(document).length) return result;
  if (result.facts) throw new Error("computer-search-mixed-media-conditions");
  return { ...result, facts: { kind: "document", document } };
};
