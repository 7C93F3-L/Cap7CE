import type { VisualPropertyVector } from "../visualPropertyTypes";
import { visualColorFamilies } from "../visualPropertyTypes";

export const CORE_IMAGE_METADATA_EXTRACTOR_VERSION = 2;
const scalars = ["transparentRatio", "semitransparentRatio", "borderTransparentRatio", "brightnessMean", "brightnessMedian",
  "darkRatio", "highlightRatio", "saturationMean", "highSaturationRatio", "lowSaturationRatio", "borderWhiteRatio", "borderBlackRatio", "borderUniformity"] as const;
export const imageMetadataMetrics = [...scalars, ...visualColorFamilies.map(color => `colorRatio.${color}`),
  ...visualColorFamilies.map(color => `colorBlockRatio.${color}`)];
export type ImageMetadataProperties = Record<string, number>;
export const validImageMetadataProperties = (value: unknown): value is ImageMetadataProperties => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const properties = value as Record<string, unknown>;
  return Object.keys(properties).length === imageMetadataMetrics.length && imageMetadataMetrics.every(key =>
    Object.prototype.hasOwnProperty.call(properties, key) && Number.isSafeInteger(properties[key]) && Number(properties[key]) >= 0 && Number(properties[key]) <= 10000);
};
export const flattenImageMetadataProperties = (properties: VisualPropertyVector | null): ImageMetadataProperties | null => {
  if (properties === null) return null;
  const result: ImageMetadataProperties = {};
  for (const key of scalars) result[key] = properties[key];
  for (const color of visualColorFamilies) {
    result[`colorRatio.${color}`] = properties.colorRatios[color];
    result[`colorBlockRatio.${color}`] = properties.colorBlockRatios[color];
  }
  if (!validImageMetadataProperties(result)) throw new Error("metadata-image-invalid-vector");
  return result;
};
