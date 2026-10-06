import type { ArchiveMetadataProperties } from "./archiveMetadataReader";
import { searchArchiveContentTypes } from "../archiveSearchFilters";
export const validMetadataArchiveProperties = (value: unknown): value is ArchiveMetadataProperties => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["listingComplete", "fileCount", "hasDirectories", "contentTypes"].includes(key))
    || typeof input.listingComplete !== "boolean" || !Array.isArray(input.contentTypes) || input.contentTypes.length > 8
    || new Set(input.contentTypes).size !== input.contentTypes.length
    || input.contentTypes.some(item => !searchArchiveContentTypes.some(choice => choice === item))
    || input.hasDirectories !== undefined && typeof input.hasDirectories !== "boolean") return false;
  if (input.listingComplete) return Number.isSafeInteger(input.fileCount) && Number(input.fileCount) >= 0 && typeof input.hasDirectories === "boolean";
  return input.fileCount === undefined && input.hasDirectories !== false && (input.hasDirectories === true || input.contentTypes.length > 0);
};
