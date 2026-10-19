import type { PdfPreviewMetadata } from "../src/shared/pdfPreviewTypes";
import { CoreProviderPreviewClient, cancelledPreview } from "./core/coreProviderPreviewClient";
import { requestCoreProviderPreview } from "./core/coreProviderPreviewHost";
import { validPdfPreview } from "./core/coreProviderPreviewProjection";
export type { PdfPreviewMetadata } from "../src/shared/pdfPreviewTypes";
const client = new CoreProviderPreviewClient<PdfPreviewMetadata>("pdf", validPdfPreview, undefined, true);
export const openPdfPreviewSession = (session: string, filePath: string, authorizedFilePath = filePath) => client.open(session, filePath, authorizedFilePath);
export const closePdfPreviewSession = (session?: string) => client.close(session);
export const renderPdfPreviewPage = async (session: string, filePath: string, pageNumber: number) => {
 const current = client.guard(session);
 const result = await requestCoreProviderPreview("pdf.render", [session, filePath, pageNumber]) as { base64?: unknown };
 if (!current()) throw cancelledPreview();
 if (!result || typeof result.base64 !== "string" || result.base64.length > 64 * 1024 * 1024) throw Error("core-preview-invalid-response");
 const buffer = Buffer.from(result.base64, "base64"); if (!buffer.length || buffer.toString("base64") !== result.base64 || !buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error("core-preview-invalid-response"); return buffer;
};
