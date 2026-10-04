import fs from "node:fs/promises";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import type { DocumentContentCountKind } from "./documentFactTypes";

const maximumDocumentBytes = 256 * 1024 * 1024;
const maximumMetadataEntryBytes = 2 * 1024 * 1024;
const maximumPdfCompositionPages = 64;
type PdfJsModule = typeof import("pdfjs-dist");
const importEsmModule = new Function("specifier", "return import(specifier);") as (specifier: string) => Promise<PdfJsModule>;
let pdfJsPromise: Promise<PdfJsModule> | null = null;
const loadPdfJs = () => (pdfJsPromise ??= importEsmModule("pdfjs-dist/legacy/build/pdf.mjs"));

const readZipFact = async (filePath: string, entryName: string, mediaPrefix: string) => {
  const source = new Uint8Array(await fs.readFile(filePath));
  const target = entryName.toLowerCase();
  const normalizedMediaPrefix = mediaPrefix.toLowerCase();
  let hasEmbeddedImages = false;
  const entries = unzipSync(source, {
    filter: (entry) => {
      const normalizedName = entry.name.replace(/\\/g, "/").toLowerCase();
      if (normalizedName.startsWith(normalizedMediaPrefix) && !normalizedName.endsWith("/") && Number(entry.originalSize || 0) > 0) hasEmbeddedImages = true;
      return normalizedName === target && Number(entry.originalSize || 0) <= maximumMetadataEntryBytes;
    }
  });
  const entry = Object.entries(entries).find(([name]) => name.replace(/\\/g, "/").toLowerCase() === target)?.[1];
  if (!entry) throw new Error("document-metadata-entry-missing");
  return { xml: strFromU8(entry), hasEmbeddedImages };
};

const positiveCount = (value: string | undefined) => {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1 || count > 100_000) throw new Error("document-content-count-invalid");
  return count;
};

const readPdfFact = async (filePath: string) => {
  const sourceData = new Uint8Array(await fs.readFile(filePath));
  const { getDocument, OPS } = await loadPdfJs();
  const loadingTask = getDocument({
    data: sourceData,
    disableAutoFetch: true,
    disableRange: true,
    disableStream: true,
    enableXfa: false,
    isEvalSupported: false,
    stopAtErrors: true,
    useSystemFonts: true,
    useWorkerFetch: false,
    verbosity: 0
  });
  let document: Awaited<typeof loadingTask.promise> | null = null;
  try {
    document = await loadingTask.promise;
    const imageOperators = new Set([
      OPS.paintImageMaskXObject,
      OPS.paintImageMaskXObjectGroup,
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintInlineImageXObjectGroup,
      OPS.paintImageXObjectRepeat,
      OPS.paintImageMaskXObjectRepeat,
      OPS.paintSolidColorImageMask
    ]);
    let hasEmbeddedImages = false;
    let imageCompositionKnown = document.numPages <= maximumPdfCompositionPages;
    try {
      const pageLimit = Math.min(document.numPages, maximumPdfCompositionPages);
      for (let pageNumber = 1; pageNumber <= pageLimit && !hasEmbeddedImages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        try {
          const operators = await page.getOperatorList();
          hasEmbeddedImages = operators.fnArray.some((operator) => imageOperators.has(operator));
        } finally {
          page.cleanup();
        }
      }
      if (hasEmbeddedImages) imageCompositionKnown = true;
    } catch {
      imageCompositionKnown = false;
      hasEmbeddedImages = false;
    }
    return { contentCount: positiveCount(String(document.numPages)), countKind: "pages" as const, imageCompositionKnown, hasEmbeddedImages };
  } finally {
    if (document) await document.destroy().catch(() => undefined);
    else await loadingTask.destroy().catch(() => undefined);
  }
};

export const readDocumentFact = async (filePath: string): Promise<{ contentCount: number; countKind: DocumentContentCountKind; imageCompositionKnown: boolean; hasEmbeddedImages: boolean }> => {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size <= 0 || stat.size > maximumDocumentBytes) throw new Error("document-source-unavailable");
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".pdf") return readPdfFact(filePath);
  if (extension === ".docx") {
    const { xml, hasEmbeddedImages } = await readZipFact(filePath, "docProps/app.xml", "word/media/");
    return { contentCount: positiveCount(/<(?:\w+:)?Pages>\s*(\d+)\s*<\/(?:\w+:)?Pages>/i.exec(xml)?.[1]), countKind: "pages", imageCompositionKnown: true, hasEmbeddedImages };
  }
  if (extension === ".pptx") {
    const { xml, hasEmbeddedImages } = await readZipFact(filePath, "ppt/presentation.xml", "ppt/media/");
    return { contentCount: positiveCount(String((xml.match(/<(?:\w+:)?sldId\b/gi) ?? []).length)), countKind: "slides", imageCompositionKnown: true, hasEmbeddedImages };
  }
  if (extension === ".xlsx") {
    const { xml, hasEmbeddedImages } = await readZipFact(filePath, "xl/workbook.xml", "xl/media/");
    return { contentCount: positiveCount(String((xml.match(/<(?:\w+:)?sheet\b/gi) ?? []).length)), countKind: "sheets", imageCompositionKnown: true, hasEmbeddedImages };
  }
  throw new Error("document-format-unsupported");
};
