export const TEXT_DATA_FACT_EXTRACTOR_VERSION = 1;

export const supportedTextFactExtensions = [".txt", ".md", ".html", ".ini", ".css", ".js", ".py"] as const;
export const supportedCsvFactExtensions = [".csv"] as const;
export const supportedJsonFactExtensions = [".json"] as const;
export const supportedTextDataFactExtensions = [
  ...supportedTextFactExtensions,
  ...supportedCsvFactExtensions,
  ...supportedJsonFactExtensions
] as const;

export type TextDataFactKind = "text" | "csv" | "json";
export type JsonRootKind = "none" | "array" | "object";
export interface TextDataFactCandidate { filePath: string; sourceRevision: string }
export interface TextDataFactResult {
  sourceRevision: string;
  extractorVersion: number;
  status: "indexed" | "failed";
  factKind: TextDataFactKind;
  characterCount: number;
  lineCount: number;
  recordCount: number;
  columnCount: number;
  jsonRootKind: JsonRootKind;
  errorCode: string;
}
export interface TextDataFactWriteRecord { filePath: string; result: TextDataFactResult }
