import type { EpubPreviewData, EpubPreviewFallbackReason } from "../src/shared/epubPreviewTypes";
import { CoreProviderPreviewClient, providerPreviewFailure } from "./core/coreProviderPreviewClient";
import { validBookPreview } from "./core/coreProviderPreviewProjection";
export class EpubPreviewError extends Error { constructor(readonly reason: EpubPreviewFallbackReason, message: string) { super(message); this.name = "EpubPreviewError"; } }
const fail = (error: unknown) => providerPreviewFailure(error, (reason, message) => new EpubPreviewError(reason as EpubPreviewFallbackReason, message));
const client = new CoreProviderPreviewClient<EpubPreviewData>("epub", validBookPreview, fail);
export const openEpubPreviewSession = (session: string, filePath: string) => client.open(session, filePath);
export const closeEpubPreviewSession = (session?: string) => client.close(session);
