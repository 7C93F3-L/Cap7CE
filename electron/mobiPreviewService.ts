import type { MobiPreviewData, MobiPreviewFallbackReason } from "../src/shared/mobiPreviewTypes";
import { CoreProviderPreviewClient, providerPreviewFailure } from "./core/coreProviderPreviewClient";
import { validBookPreview } from "./core/coreProviderPreviewProjection";
export class MobiPreviewError extends Error { constructor(readonly reason: MobiPreviewFallbackReason, message: string) { super(message); this.name = "MobiPreviewError"; } }
const fail = (error: unknown) => providerPreviewFailure(error, (reason, message) => new MobiPreviewError(reason as MobiPreviewFallbackReason, message));
const client = new CoreProviderPreviewClient<MobiPreviewData>("mobi", validBookPreview, fail);
export const openMobiPreviewSession = (session: string, filePath: string) => client.open(session, filePath);
export const closeMobiPreviewSession = (session?: string) => client.close(session);
