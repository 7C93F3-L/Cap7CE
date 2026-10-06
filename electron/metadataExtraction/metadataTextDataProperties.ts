import type { MetadataTextDataProperties } from "./metadataWorkerTypes";

export const validMetadataTextDataProperties = (value: unknown): value is MetadataTextDataProperties => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const count = (key: string) => Number.isSafeInteger(input[key]) && Number(input[key]) >= 0;
  const only = (fields: string[]) => Object.keys(input).every(key => fields.includes(key));
  if (input.factKind === "text") return only(["factKind", "characterCount", "lineCount"]) && count("characterCount") && count("lineCount");
  if (input.factKind === "csv") return only(["factKind", "recordCount", "columnCount"]) && count("recordCount") && count("columnCount");
  if (input.factKind === "json") return only(["factKind", "recordCount", "jsonRootKind"]) && count("recordCount")
    && (input.jsonRootKind === "array" || input.jsonRootKind === "object");
  return false;
};
