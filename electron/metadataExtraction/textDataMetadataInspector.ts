import { readTextDataFact } from "../textDataFactExtractor";
import type { MetadataTextDataProperties } from "./metadataWorkerTypes";

// The owned OS helper bounds parsing lifetime. Only counts leave that process;
// unrelated legacy zero placeholders and all source text stay out of Core.
export const inspectTextDataMetadata = async (filePath: string, signal: AbortSignal): Promise<MetadataTextDataProperties> => {
  signal.throwIfAborted();
  const fact = await readTextDataFact(filePath);
  signal.throwIfAborted();
  if (fact.factKind === "text") return { factKind: "text", characterCount: fact.characterCount, lineCount: fact.lineCount };
  if (fact.factKind === "csv") return { factKind: "csv", recordCount: fact.recordCount, columnCount: fact.columnCount };
  if (fact.jsonRootKind !== "array" && fact.jsonRootKind !== "object") throw new Error("text-data-json-root-unsupported");
  return { factKind: "json", recordCount: fact.recordCount, jsonRootKind: fact.jsonRootKind };
};
