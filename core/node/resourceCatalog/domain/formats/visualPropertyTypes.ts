export const VISUAL_PROPERTY_ANALYZER_VERSION = 1;
export const VISUAL_PROPERTY_RATIO_SCALE = 10_000;

export const visualColorFamilies = [
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
  "pink"
] as const;

export type VisualColorFamily = typeof visualColorFamilies[number];
export type VisualPropertyStatus = "indexed" | "failed";
export type VisualColorRatioMap = Record<VisualColorFamily, number>;

export interface VisualPropertyVector {
  transparentRatio: number;
  semitransparentRatio: number;
  borderTransparentRatio: number;
  brightnessMean: number;
  brightnessMedian: number;
  darkRatio: number;
  highlightRatio: number;
  saturationMean: number;
  highSaturationRatio: number;
  lowSaturationRatio: number;
  borderWhiteRatio: number;
  borderBlackRatio: number;
  borderUniformity: number;
  colorRatios: VisualColorRatioMap;
  colorBlockRatios: VisualColorRatioMap;
}

export interface VisualPropertyIndexRecord {
  sourceRevision: string;
  analyzerVersion: number;
  status: VisualPropertyStatus;
  properties: VisualPropertyVector | null;
  errorCode: string;
}

export interface StoredVisualPropertyRecord extends VisualPropertyIndexRecord {
  indexedAt: string;
}

export interface VisualPropertyAnalysisCandidate {
  filePath: string;
  thumbnailPath: string;
  sourceRevision: string;
}

export interface VisualPropertyWriteRecord {
  filePath: string;
  record: VisualPropertyIndexRecord;
}
