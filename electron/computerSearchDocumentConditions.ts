import type { ComputerSearchDocumentFilter } from "../src/shared/computerSearchDocumentTypes";
const fields = ["minimumContentCount", "maximumContentCount", "hasEmbeddedImages", "minimumArtboardCount", "maximumArtboardCount"];
const invalid = (): never => { throw new Error("computer-search-invalid-facts"); };
export const readComputerSearchDocument = (value: unknown): ComputerSearchDocumentFilter => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) return invalid();
  const input = value as Record<string, unknown>, result: ComputerSearchDocumentFilter = {};
  if (input.hasEmbeddedImages !== undefined) {
    if (typeof input.hasEmbeddedImages !== "boolean") return invalid();
    result.hasEmbeddedImages = input.hasEmbeddedImages;
  }
  for (const key of ["minimumContentCount", "maximumContentCount", "minimumArtboardCount", "maximumArtboardCount"] as const) {
    if (input[key] === undefined) continue;
    const artboard = key.includes("Artboard");
    if (!Number.isSafeInteger(input[key]) || Number(input[key]) < (artboard ? 0 : 1)
      || Number(input[key]) > (artboard ? 1_000_000_000 : 100_000)) return invalid();
    result[key] = input[key] as number;
  }
  for (const [low, high] of [[result.minimumContentCount, result.maximumContentCount], [result.minimumArtboardCount, result.maximumArtboardCount]])
    if (low !== undefined && high !== undefined && low > high) return invalid();
  return result;
};
