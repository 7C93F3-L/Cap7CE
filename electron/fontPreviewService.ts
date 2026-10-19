import type { FontPreviewData, FontPreviewFallbackReason } from "../src/shared/fontPreviewTypes";
import { CoreProviderPreviewClient, providerPreviewFailure } from "./core/coreProviderPreviewClient";
import { validFontPreview } from "./core/coreProviderPreviewProjection";
export class FontPreviewError extends Error { constructor(readonly reason: FontPreviewFallbackReason, message: string) { super(message); this.name = "FontPreviewError"; } }
const fail = (error: unknown) => providerPreviewFailure(error, (reason, message) => new FontPreviewError(reason as FontPreviewFallbackReason, message));
const client = new CoreProviderPreviewClient<FontPreviewData>("font", validFontPreview, fail);
export const openFontPreviewSession = (session: string, filePath: string, language: "zh-CN" | "en-US") => client.open(session, filePath, language);
export const closeFontPreviewSession = (session?: string) => client.close(session);
export { isFontPreviewRequestAuthorized } from "./fontPreviewAuthorization";
export { maximumFontPreviewBytes, supportedFontPreviewExtensions } from "./fontPreviewLimits";
import { requestCoreProviderPreview } from "./core/coreProviderPreviewHost";
export const inspectFontPreviewSource = async (filePath: string) => { try { const result = await requestCoreProviderPreview("font.inspect", [filePath]) as { normalizedPath: string; size: number }; if (!result || typeof result.normalizedPath !== "string" || !Number.isSafeInteger(result.size) || result.size < 0) throw Error("core-preview-invalid-response"); return result; } catch (error) { throw fail(error); } };
