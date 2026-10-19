import { randomUUID } from "node:crypto";
import type { StoredMetadataSource, LegacyKeywordPage } from "../../src/shared/storedMetadataTypes";
import type { CoreNodeTransport } from "../../src/shared/coreNodeTransport";
import { emptyStoredMetadata, validStoredMetadata, validStoredCounts, validLegacyKeywordPage } from "./storedMetadataProjection";
const request = async (method: string, value: unknown[], injected?: CoreNodeTransport) => {
  const id = randomUUID();
  const transport: NonNullable<CoreNodeTransport> = injected ?? await import("../visualCacheService").then(service => ({ request: service.requestVisualCacheOwner, cancel: service.requestActiveVisualCacheOwner }));
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([transport.request(method, [id, ...value]), new Promise<null>(resolve => { timer = setTimeout(() => { void transport.cancel("cancelPreviewMetadata", [id]).catch(() => undefined); resolve(null); }, 8000); })]); }
  finally { clearTimeout(timer); }
};
export async function readCoreStoredMetadata(filePath: string, source: StoredMetadataSource, injected?: CoreNodeTransport) {
  const value = await request("storedMetadata", [filePath, source], injected).catch(() => null);
  return validStoredMetadata(value) ? value : { ...emptyStoredMetadata };
}
export async function readCoreStoredCounts(ids: string[], injected?: CoreNodeTransport) {
  const value = await request("storedCounts", [ids], injected).catch(() => null);
  return validStoredCounts(ids)(value) ? value : Object.fromEntries(ids.map(id => [id, 0]));
}
export async function readCoreLegacyKeywordPage(after: string, injected?: CoreNodeTransport): Promise<LegacyKeywordPage> {
  const value = await request("legacyKeywordPage", [after], injected);
  if (!validLegacyKeywordPage(value)) throw Error("legacy-keywords-unavailable"); return value;
}
