export const FONT_FACT_EXTRACTOR_VERSION = 1;
export const supportedFontFactExtensions = [".otf", ".ttf"] as const;

export interface FontFactCandidate { filePath: string; sourceRevision: string }
export interface FontFactResult {
  sourceRevision: string;
  extractorVersion: number;
  status: "indexed" | "failed";
  weight: number;
  italic: boolean;
  supportsLatin: boolean;
  supportsChinese: boolean;
  variable: boolean;
  errorCode: string;
}
export interface FontFactWriteRecord { filePath: string; result: FontFactResult }
