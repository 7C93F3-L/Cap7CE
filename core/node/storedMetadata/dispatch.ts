import type { InteractiveMetadataOwner } from "../interactiveMetadata/owner";
import type { StoredIndexRequest, LegacyKeywordPage } from "../../../core/shared/storedMetadataTypes";
import { emptyStoredMetadata, validStoredMetadata, validStoredCounts, validLegacyKeywordPage } from "./contracts/storedMetadataProjection";
export function readStoredMetadata(owner: InteractiveMetadataOwner, id: string, root: string, request: StoredIndexRequest) {
  const data = { root, request };
  if (request.kind === "metadata") return owner.run(id, "stored-metadata.cjs", data, validStoredMetadata, emptyStoredMetadata);
  if (request.kind === "counts") return owner.run(id, "stored-metadata.cjs", data, validStoredCounts(request.ids), Object.fromEntries(request.ids.map(id => [id, 0])));
  return owner.run<LegacyKeywordPage | null>(id, "stored-metadata.cjs", data, (value): value is LegacyKeywordPage | null => value === null || validLegacyKeywordPage(value), null);
}
export function dispatchStoredMetadata(owner: InteractiveMetadataOwner, root: string, method: string, args: unknown[], probeId: (value: unknown) => string, filePath: (value: unknown) => string) {
  const invalid = (): never => { throw Error("core-cache-invalid-request"); };
  if (args.length !== (method === "storedMetadata" ? 3 : 2)) return invalid();
  const id = probeId(args[0]);
  if (method === "storedMetadata") {
    const source = args[2] as { fileSize?: unknown; modifiedAt?: unknown } | null;
    if (!source || Object.keys(source).sort().join(",") !== "fileSize,modifiedAt" || typeof source.fileSize !== "number" || !Number.isFinite(source.fileSize) || typeof source.modifiedAt !== "string" || source.modifiedAt.length > 128) return invalid();
    return readStoredMetadata(owner, id, root, { kind: "metadata", path: filePath(args[1]), source: { fileSize: source.fileSize, modifiedAt: source.modifiedAt } });
  }
  if (method === "storedCounts") {
    if (!Array.isArray(args[1]) || args[1].length > 4096 || args[1].some(id => typeof id !== "string" || !id || id.length > 256 || id.includes("\0"))) return invalid();
    return readStoredMetadata(owner, id, root, { kind: "counts", ids: args[1] });
  }
  if (method !== "legacyKeywordPage" || typeof args[1] !== "string" || args[1].length > 32767 || args[1].includes("\0")) return invalid();
  return readStoredMetadata(owner, id, root, { kind: "keywords", after: args[1] });
}
