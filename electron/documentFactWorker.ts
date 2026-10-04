import { parentPort } from "node:worker_threads";
import path from "node:path";
import { readArtboardFact, readDocumentFact } from "./documentFactExtractor";
import { DOCUMENT_FACT_EXTRACTOR_VERSION, type DocumentFactCandidate, type DocumentFactResult } from "./documentFactTypes";

const failed = (candidate: DocumentFactCandidate, errorCode: string): DocumentFactResult => ({
  sourceRevision: candidate.sourceRevision,
  extractorVersion: DOCUMENT_FACT_EXTRACTOR_VERSION,
  status: "failed",
  contentCount: 0,
  countKind: "pages",
  imageCompositionKnown: false,
  hasEmbeddedImages: false,
  artboardCountKnown: false,
  artboardCount: 0,
  errorCode
});

parentPort?.on("message", async (request: { id: number; candidate: DocumentFactCandidate }) => {
  try {
    const extension = path.extname(request.candidate.filePath).toLowerCase();
    const artboardDocument = extension === ".ai" || extension === ".cdr" || extension === ".psd";
    const fact = artboardDocument
      ? { contentCount: 0, countKind: "pages" as const, imageCompositionKnown: false, hasEmbeddedImages: false, artboardCountKnown: true, artboardCount: await readArtboardFact(request.candidate.filePath) }
      : { ...await readDocumentFact(request.candidate.filePath), artboardCountKnown: false, artboardCount: 0 };
    parentPort?.postMessage({ id: request.id, result: {
      sourceRevision: request.candidate.sourceRevision,
      extractorVersion: DOCUMENT_FACT_EXTRACTOR_VERSION,
      status: "indexed",
      ...fact,
      errorCode: ""
    } satisfies DocumentFactResult });
  } catch (error) {
    const code = error instanceof Error && /^(?:document|artboard|cdr|psd)-[a-z-]+$/.test(error.message) ? error.message : "document-fact-read-failed";
    parentPort?.postMessage({ id: request.id, result: failed(request.candidate, code) });
  }
});
