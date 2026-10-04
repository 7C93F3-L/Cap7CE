import { parentPort } from "node:worker_threads";
import { readDocumentFact } from "./documentFactExtractor";
import { DOCUMENT_FACT_EXTRACTOR_VERSION, type DocumentFactCandidate, type DocumentFactResult } from "./documentFactTypes";

const failed = (candidate: DocumentFactCandidate, errorCode: string): DocumentFactResult => ({
  sourceRevision: candidate.sourceRevision,
  extractorVersion: DOCUMENT_FACT_EXTRACTOR_VERSION,
  status: "failed",
  contentCount: 0,
  countKind: "pages",
  imageCompositionKnown: false,
  hasEmbeddedImages: false,
  errorCode
});

parentPort?.on("message", async (request: { id: number; candidate: DocumentFactCandidate }) => {
  try {
    const fact = await readDocumentFact(request.candidate.filePath);
    parentPort?.postMessage({ id: request.id, result: {
      sourceRevision: request.candidate.sourceRevision,
      extractorVersion: DOCUMENT_FACT_EXTRACTOR_VERSION,
      status: "indexed",
      ...fact,
      errorCode: ""
    } satisfies DocumentFactResult });
  } catch (error) {
    const code = error instanceof Error && /^document-[a-z-]+$/.test(error.message) ? error.message : "document-content-count-read-failed";
    parentPort?.postMessage({ id: request.id, result: failed(request.candidate, code) });
  }
});
