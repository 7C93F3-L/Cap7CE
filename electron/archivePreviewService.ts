import type { ArchivePreviewData, ArchivePreviewFallbackReason } from "../src/shared/archivePreviewTypes";
import { CoreProviderPreviewClient, providerPreviewFailure } from "./core/coreProviderPreviewClient";
import { validArchivePreview } from "./core/coreProviderPreviewProjection";
export class ArchivePreviewError extends Error { constructor(readonly reason: ArchivePreviewFallbackReason, message: string) { super(message); this.name = "ArchivePreviewError"; } }
const fail = (error: unknown) => providerPreviewFailure(error, (reason, message) => new ArchivePreviewError(reason as ArchivePreviewFallbackReason, message));
const client = new CoreProviderPreviewClient<ArchivePreviewData>("archive", validArchivePreview, fail);
export const openArchivePreviewSession = (session: string, filePath: string) => client.open(session, filePath);
export const closeArchivePreviewSession = (session?: string) => client.close(session);
export { parseArchiveListOutput } from "./archivePreviewList";
