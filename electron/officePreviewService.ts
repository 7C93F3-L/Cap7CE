import path from "node:path";
import type { OfficePreviewResult } from "../src/shared/officePreviewTypes";
import { CoreProviderPreviewClient } from "./core/coreProviderPreviewClient";
import { requestCoreOfficePreview } from "./core/coreOfficePreviewHost";
import { officePreviewFailure } from "./core/coreOfficePreviewFailure";
export type { OfficePreviewKind } from "../src/shared/officePreviewTypes";
const valid = (value: unknown): value is OfficePreviewResult => !!value && typeof value === "object" && ["excel", "powerpoint"].includes((value as OfficePreviewResult).kind)
 && typeof (value as OfficePreviewResult).pdfPath === "string" && path.isAbsolute((value as OfficePreviewResult).pdfPath) && path.extname((value as OfficePreviewResult).pdfPath).toLowerCase() === ".pdf";
const client = new CoreProviderPreviewClient<OfficePreviewResult>("office", valid, officePreviewFailure, true, requestCoreOfficePreview);
export const openOfficePreviewSession = (session: string, file: string) => client.open(session, file);
export const closeOfficePreviewSession = (session?: string) => client.close(session);
export const prepareOfficePreviewTemporaryRoot = () => requestCoreOfficePreview("office.prepare", []);
export { clearOfficePreviewCacheFiles as clearOfficePreviewCache } from "./officePreviewCache";
