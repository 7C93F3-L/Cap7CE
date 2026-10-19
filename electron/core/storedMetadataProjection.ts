import { validPreviewMetadata } from "./previewMetadataProjection";
import type { StoredMetadataResult, LegacyKeywordPage } from "../../src/shared/storedMetadataTypes";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const emptyStoredMetadata: StoredMetadataResult = { metadata: null, isCurrent: false };
export const validStoredMetadata = (value: unknown): value is StoredMetadataResult => object(value)
  && Object.keys(value).sort().join(",") === "isCurrent,metadata" && typeof value.isCurrent === "boolean" && validPreviewMetadata(value.metadata);
export const validStoredCounts = (ids: string[]) => (value: unknown): value is Record<string, number> => object(value)
  && Object.keys(value).length === new Set(ids).size && ids.every(id => Object.prototype.hasOwnProperty.call(value, id) && Number.isSafeInteger(value[id]) && Number(value[id]) >= 0);
export const validLegacyKeywordPage = (value: unknown): value is LegacyKeywordPage => object(value)
  && Object.keys(value).sort().join(",") === "after,entries" && (value.after === null || typeof value.after === "string" && value.after.length <= 32767)
  && Array.isArray(value.entries) && value.entries.length <= 64 && value.entries.every(entry => object(entry)
    && typeof entry.path === "string" && entry.path.length <= 32767 && typeof entry.createdFileTimeMilliseconds === "string" && /^\d{1,19}$/.test(entry.createdFileTimeMilliseconds)
    && Array.isArray(entry.keywords) && entry.keywords.length <= 128 && entry.keywords.every(word => typeof word === "string" && word.length <= 256));
