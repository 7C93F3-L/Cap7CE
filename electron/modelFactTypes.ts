export const MODEL_FACT_EXTRACTOR_VERSION = 1;
export const supportedModelFactExtensions = [".gguf", ".safetensors"] as const;

export type ModelPrecision = "f32" | "f16-bf16" | "8bit" | "6bit" | "5bit" | "4bit" | "3bit-or-less";

export interface ModelFactCandidate { filePath: string; sourceRevision: string }
export interface ModelFactResult {
  sourceRevision: string;
  extractorVersion: number;
  status: "indexed" | "failed";
  parameterCount: number;
  precision: ModelPrecision | "";
  errorCode: string;
}
export interface ModelFactWriteRecord { filePath: string; result: ModelFactResult }
