import type { SearchState } from "../../shared/types";
import type { ComputerSearchConditions } from "../../shared/computerSearchFactTypes";
import type { ComputerSearchTextDataFilter } from "../../shared/computerSearchTextDataTypes";
import { toComputerSearchThreeDConditions } from "./computerSearchThreeDConditions";
type Counts = Record<string, readonly [number, number?]>;
const characters: Counts = { "up-to-100": [0, 100], "101-1000": [101, 1000], "1001-10000": [1001, 10000], "10001-100000": [10001, 100000], "over-100000": [100001] };
const lines: Counts = { "up-to-10": [0, 10], "11-50": [11, 50], "51-200": [51, 200], "201-1000": [201, 1000], "over-1000": [1001] };
const records: Counts = { "up-to-10": [0, 10], "11-100": [11, 100], "101-1000": [101, 1000], "1001-10000": [1001, 10000], "over-10000": [10001] };
const columns: Counts = { one: [1, 1], "2-5": [2, 5], "6-10": [6, 10], "11-30": [11, 30], "over-30": [31] };
const invalid = (): never => { throw new Error("computer-search-invalid-text-data-selection"); };
const selection = (preset: unknown, range: unknown, counts: Counts): readonly [number?, number?] => {
  if (preset !== undefined && (typeof preset !== "string" || !Object.prototype.hasOwnProperty.call(counts, preset))) return invalid();
  if (range !== undefined) {
    if (!range || typeof range !== "object" || Array.isArray(range) || Object.keys(range).some(key => !["minCount", "maxCount"].includes(key))) return invalid();
    const input = range as Record<string, unknown>, min = input.minCount, max = input.maxCount;
    if ([min, max].some(value => value !== undefined && (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 1_000_000_000))
      || min === undefined && max === undefined || min !== undefined && max !== undefined && Number(min) > Number(max)) return invalid();
    return [min as number | undefined, max as number | undefined];
  }
  return typeof preset === "string" ? counts[preset] : [];
};
export const toComputerSearchTextDataConditions = (search: SearchState, referenceNow = new Date()): ComputerSearchConditions => {
  const result = toComputerSearchThreeDConditions(search, referenceNow);
  const text = [search.textCharacterCountPreset, search.textCharacterCountRange, search.textLineCountPreset, search.textLineCountRange].some(value => value !== undefined);
  const csv = [search.csvRecordCountPreset, search.csvRecordCountRange, search.csvColumnCountPreset, search.csvColumnCountRange].some(value => value !== undefined);
  const json = [search.jsonItemCountPreset, search.jsonItemCountRange, search.jsonRootKind].some(value => value !== undefined);
  if (!text && !csv && !json) return result;
  if ([text, csv, json].filter(Boolean).length !== 1 || result.facts) throw new Error("computer-search-mixed-media-conditions");
  const properties: ComputerSearchTextDataFilter = { factKind: text ? "text" : csv ? "csv" : "json" };
  const apply = (minKey: keyof ComputerSearchTextDataFilter, maxKey: keyof ComputerSearchTextDataFilter, value: readonly [number?, number?]) => {
    Object.assign(properties, ...(value[0] === undefined ? [] : [{ [minKey]: value[0] }]), ...(value[1] === undefined ? [] : [{ [maxKey]: value[1] }]));
  };
  if (text) {
    apply("minimumCharacterCount", "maximumCharacterCount", selection(search.textCharacterCountPreset, search.textCharacterCountRange, characters));
    apply("minimumLineCount", "maximumLineCount", selection(search.textLineCountPreset, search.textLineCountRange, lines));
  } else if (csv) {
    apply("minimumRecordCount", "maximumRecordCount", selection(search.csvRecordCountPreset, search.csvRecordCountRange, records));
    apply("minimumColumnCount", "maximumColumnCount", selection(search.csvColumnCountPreset, search.csvColumnCountRange, columns));
  } else {
    apply("minimumRecordCount", "maximumRecordCount", selection(search.jsonItemCountPreset, search.jsonItemCountRange, records));
    if (search.jsonRootKind !== undefined) {
      if (search.jsonRootKind !== "array" && search.jsonRootKind !== "object") return invalid();
      properties.jsonRootKind = search.jsonRootKind;
    }
  }
  return { ...result, facts: { kind: "text-data", textData: properties } };
};
