import path from "node:path";
import type { LocalKeywordModelConnection, KeywordSourceIdentity } from "../../../src/shared/localKeywordTypes";
import { maximumCacheImageBytes } from "../../../electron/core/visualCacheFrames";

export const invalid = (): never => { throw new Error("local-keywords-invalid-request"); };
const keys = (value: unknown, expected: string): value is Record<string, unknown> => !!value && typeof value === "object" && Object.keys(value).sort().join(",") === expected;
export const requestId = (value: unknown): string => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value : invalid();
export const connection = (value: unknown): LocalKeywordModelConnection => {
  if (!keys(value, "baseUrl,modelName") || typeof value.baseUrl !== "string" || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(value.baseUrl)
    || Number(value.baseUrl.slice(value.baseUrl.lastIndexOf(":") + 1)) > 65535 || typeof value.modelName !== "string" || !value.modelName.length
    || value.modelName.length > 512 || /[\u0000-\u001f]/u.test(value.modelName)) return invalid();
  return { baseUrl: value.baseUrl, modelName: value.modelName };
};
export const imageData = (value: unknown): string => {
  if (typeof value !== "string" || !value.startsWith("data:image/jpeg;base64,") || value.length > Math.ceil(maximumCacheImageBytes / 3) * 4 + 23) return invalid();
  const data = value.slice(23), image = Buffer.from(data, "base64");
  if (image.length < 3 || image.length > maximumCacheImageBytes || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff || image.toString("base64") !== data) return invalid();
  return value;
};
export const timeout = (value: unknown): number => typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 120000 ? value : invalid();
export const source = (value: unknown): KeywordSourceIdentity => {
  if (!keys(value, "createdFileTimeMilliseconds,createdUtcTicks,fileReference,path") || typeof value.path !== "string"
    || !value.path.length || value.path.length > 32767 || value.path.includes("\0") || !path.isAbsolute(value.path)
    || typeof value.fileReference !== "string" || value.fileReference.length > 128
    || value.createdUtcTicks !== null && (typeof value.createdUtcTicks !== "number" || !Number.isFinite(value.createdUtcTicks))
    || value.createdFileTimeMilliseconds !== null && (typeof value.createdFileTimeMilliseconds !== "string" || !/^[0-9]{1,20}$/.test(value.createdFileTimeMilliseconds))) return invalid();
  return value as unknown as KeywordSourceIdentity;
};
