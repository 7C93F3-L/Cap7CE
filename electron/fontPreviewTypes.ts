export interface FontVariationAxis {
  tag: string;
  minimum: number;
  defaultValue: number;
  maximum: number;
}

export interface FontPreviewData {
  familyName: string;
  styleName: string;
  weight: number;
  glyphCount: number;
  supportsLatinSample: boolean;
  supportsChineseSample: boolean;
  variationAxes: FontVariationAxis[];
}

export type FontPreviewFallbackReason = "invalidFont" | "tooLarge" | "timedOut" | "failed";

export interface FontMetadataWorkerRequest {
  sourcePath: string;
  language: "zh-CN" | "en-US";
}

export type FontMetadataWorkerResponse =
  | { ok: true; data: FontPreviewData }
  | { ok: false; message: string };
