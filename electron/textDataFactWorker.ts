import path from "node:path";
import { parentPort } from "node:worker_threads";
import { readTextDataFact } from "./textDataFactExtractor";
import { TEXT_DATA_FACT_EXTRACTOR_VERSION, type TextDataFactCandidate, type TextDataFactKind, type TextDataFactResult } from "./textDataFactTypes";

const getFactKind = (filePath: string): TextDataFactKind => {
  const extension = path.extname(filePath).toLowerCase();
  return extension === ".csv" ? "csv" : extension === ".json" ? "json" : "text";
};
const failed = (candidate: TextDataFactCandidate, errorCode: string): TextDataFactResult => ({
  sourceRevision: candidate.sourceRevision,
  extractorVersion: TEXT_DATA_FACT_EXTRACTOR_VERSION,
  status: "failed",
  factKind: getFactKind(candidate.filePath),
  characterCount: 0,
  lineCount: 0,
  recordCount: 0,
  columnCount: 0,
  jsonRootKind: "none",
  errorCode
});

parentPort?.on("message", async (request: { id: number; candidate: TextDataFactCandidate }) => {
  try {
    const fact = await readTextDataFact(request.candidate.filePath);
    parentPort?.postMessage({ id: request.id, result: {
      sourceRevision: request.candidate.sourceRevision,
      extractorVersion: TEXT_DATA_FACT_EXTRACTOR_VERSION,
      status: "indexed",
      ...fact,
      errorCode: ""
    } satisfies TextDataFactResult });
  } catch (error) {
    const code = error instanceof Error && /^text-data-[a-z-]+$/.test(error.message) ? error.message : "text-data-read-failed";
    parentPort?.postMessage({ id: request.id, result: failed(request.candidate, code) });
  }
});
