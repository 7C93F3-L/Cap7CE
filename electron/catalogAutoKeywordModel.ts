import { generateCoreKeywords } from "./core/coreLocalKeywordsClient";
import type { CoreNodeTransport } from "../src/shared/coreNodeTransport";
import type { LocalKeywordModelConnection } from "../src/shared/localKeywordTypes";
export { parseGeneratedKeywords } from "./core/localKeywordPolicy";

export const generateImageKeywords = (connection: LocalKeywordModelConnection, dataUrl: string, signal: AbortSignal,
  timeoutMs = 120_000, transport?: CoreNodeTransport) => generateCoreKeywords(connection, dataUrl, signal, timeoutMs, transport);
