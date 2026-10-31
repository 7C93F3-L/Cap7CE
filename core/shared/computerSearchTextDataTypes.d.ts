export interface ComputerSearchTextDataFilter {
  factKind: "text" | "csv" | "json";
  minimumCharacterCount?: number;
  maximumCharacterCount?: number;
  minimumLineCount?: number;
  maximumLineCount?: number;
  minimumRecordCount?: number;
  maximumRecordCount?: number;
  minimumColumnCount?: number;
  maximumColumnCount?: number;
  jsonRootKind?: "array" | "object";
}
