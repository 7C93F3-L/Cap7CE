import type { ComputerSearchItem } from "./computerSearchTypes";
import type { KeywordSourceIdentity } from "../src/shared/localKeywordTypes";
import type { CoreNodeTransport } from "../src/shared/coreNodeTransport";

export async function fingerprintKeywordSource(item: ComputerSearchItem, injected?: CoreNodeTransport["request"]): Promise<string> {
  const request = injected ?? (await import("./visualCacheService")).requestVisualCacheOwner;
  const source: KeywordSourceIdentity = { path: item.path, fileReference: item.fileReference ?? "",
    createdUtcTicks: item.createdUtcTicks ?? null, createdFileTimeMilliseconds: item.createdFileTimeMilliseconds ?? null };
  const result = await request("localKeywords.fingerprint", [source]);
  if (typeof result !== "string" || result.length > 256 || !/^-?[0-9]+(?::-?[0-9]+){4}$/.test(result)) throw new Error("local-keywords-invalid-response");
  return result;
}
