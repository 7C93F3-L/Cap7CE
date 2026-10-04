import fs from "node:fs/promises";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import type { DocumentContentCountKind } from "./documentFactTypes";

const maximumDocumentBytes = 256 * 1024 * 1024;
const maximumMetadataEntryBytes = 2 * 1024 * 1024;
type PdfJsModule = typeof import("pdfjs-dist");
const importEsmModule = new Function("specifier", "return import(specifier);") as (specifier: string) => Promise<PdfJsModule>;
let pdfJsPromise: Promise<PdfJsModule> | null = null;
const loadPdfJs = () => (pdfJsPromise ??= importEsmModule("pdfjs-dist/legacy/build/pdf.mjs"));

const readZipEntry = async (filePath: string, entryName: string) => {
  const source = new Uint8Array(await fs.readFile(filePath));
  const target = entryName.toLowerCase();
  const entries = unzipSync(source, {
    filter: (entry) => entry.name.replace(/\\/g, "/").toLowerCase() === target
      && Number(entry.originalSize || 0) <= maximumMetadataEntryBytes
  });
  const entry = Object.entries(entries).find(([name]) => name.replace(/\\/g, "/").toLowerCase() === target)?.[1];
  if (!entry) throw new Error("document-metadata-entry-missing");
  return strFromU8(entry);
};

const positiveCount = (value: string | undefined) => {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1 || count > 100_000) throw new Error("document-content-count-invalid");
  return count;
};

const readPdfPageCount = async (filePath: string) => {
  const sourceData = new Uint8Array(await fs.readFile(filePath));
  const { getDocument } = await loadPdfJs();
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
    return positiveCount(String(document.numPages));
  } finally {
    if (document) await document.destroy().catch(() => undefined);
    else await loadingTask.destroy().catch(() => undefined);
  }
};

export const readDocumentContentCount = async (filePath: string): Promise<{ contentCount: number; countKind: DocumentContentCountKind }> => {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size <= 0 || stat.size > maximumDocumentBytes) throw new Error("document-source-unavailable");
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".pdf") return { contentCount: await readPdfPageCount(filePath), countKind: "pages" };
  if (extension === ".docx") {
    const xml = await readZipEntry(filePath, "docProps/app.xml");
    return { contentCount: positiveCount(/<(?:\w+:)?Pages>\s*(\d+)\s*<\/(?:\w+:)?Pages>/i.exec(xml)?.[1]), countKind: "pages" };
  }
  if (extension === ".pptx") {
    const xml = await readZipEntry(filePath, "ppt/presentation.xml");
    return { contentCount: positiveCount(String((xml.match(/<(?:\w+:)?sldId\b/gi) ?? []).length)), countKind: "slides" };
  }
  if (extension === ".xlsx") {
    const xml = await readZipEntry(filePath, "xl/workbook.xml");
    return { contentCount: positiveCount(String((xml.match(/<(?:\w+:)?sheet\b/gi) ?? []).length)), countKind: "sheets" };
  }
  throw new Error("document-format-unsupported");
};
