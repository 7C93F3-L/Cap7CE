import path from "node:path";
import { CoreVisualPreparation } from "../visualRendering/preparation";
import { InteractiveMetadataOwner } from "../interactiveMetadata/owner";
import { LocalKeywordOwner } from "../localKeywords/owner";
import { createVisualCacheStore } from "./store";
import { formalVisualCacheTypes, skimVisualCacheTypes } from "../../../electron/core/visualCachePaths";
import type { VisualCacheEntry, VisualCacheType, VisualImageMimeType } from "../../../src/shared/visualCacheTypes";

const invalid = () => { throw new Error("core-cache-invalid-request"); };
const text = (value: unknown): string => typeof value === "string" && value.length > 0 && value.length <= 32767 && !value.includes("\0") ? value : invalid();
const filePath = (value: unknown) => { const result = text(value); return path.isAbsolute(result) ? result : invalid(); };
const cacheType = (value: unknown): VisualCacheType => [...formalVisualCacheTypes, ...skimVisualCacheTypes].includes(value as VisualCacheType) ? value as VisualCacheType : invalid();
const paths = (value: unknown): string[] => Array.isArray(value) && value.length <= 100000 ? value.map(filePath) : invalid();
const entry = (value: unknown): VisualCacheEntry => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as VisualCacheEntry : invalid(); // Store authenticates every field before any path is used.
const mime = (value: unknown): VisualImageMimeType => value === "image/png" || value === "image/jpeg" ? value : invalid();
const probeId = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value : invalid();
import { maximumCacheImageBytes } from "../../../electron/core/visualCacheFrames";

export const createVisualCacheDispatcher = (root: string, directory: string) => {
  const store = createVisualCacheStore(root), visuals = new CoreVisualPreparation(store, directory);
  const metadata = new InteractiveMetadataOwner(directory);
  const keywords = new LocalKeywordOwner();
  const dispatch = async (method: unknown, args: unknown): Promise<unknown> => {
    if (!Array.isArray(args)) return invalid();
    const count = (expected: number) => { if (args.length !== expected) invalid(); };
    if (typeof method === "string" && method.startsWith("localKeywords.")) return keywords.dispatch(method, args);
    switch (method) {
      case "ensure": count(2); return visuals.ensure(filePath(args[0]), cacheType(args[1]), false);
      case "ensureShell": count(2); return visuals.ensure(filePath(args[0]), cacheType(args[1]), true);
      case "temporaryImage": count(1); return visuals.temporary(filePath(args[0]));
      case "sourceDimensions": count(1); return visuals.dimensions(filePath(args[0]));
      case "sourcePreview": count(1); return visuals.sourcePreview(filePath(args[0]));
      case "previewMetadata": count(2); return metadata.read(probeId(args[0]), filePath(args[1]));
      case "cancelPreviewMetadata": count(1); return metadata.cancel(probeId(args[0]));
      case "releaseSourceHandles": count(0); return Promise.all([visuals.release(), metadata.release()]).then(() => undefined);
      case "initialize": count(0); return store.initializeVisualCacheDirectories();
      case "stats": count(0); return store.getVisualCacheStats();
      case "skimStats": count(0); return store.getSkimVisualCacheStats();
      case "clear": count(0); return store.clearVisualCaches();
      case "clearThumbnails": count(0); return store.clearThumbnailVisualCaches();
      case "clearSkim": count(0); return store.clearSkimVisualCaches();
      case "inventory": count(0); return store.listThumbnailCacheFiles();
      case "create": count(2); return store.createVisualCacheEntry(filePath(args[0]), cacheType(args[1]));
      case "createFromMetadata": {
        count(3); const value = args[2] as { fileSize?: unknown; modifiedMs?: unknown } | null;
        if (!value || typeof value.fileSize !== "number" || !Number.isSafeInteger(value.fileSize) || value.fileSize < 0
          || typeof value.modifiedMs !== "number" || !Number.isFinite(value.modifiedMs)) return invalid();
        return store.createVisualCacheEntryFromSourceMetadata(filePath(args[0]), cacheType(args[1]), { fileSize: value.fileSize, modifiedMs: value.modifiedMs });
      }
      case "valid": count(1); return store.isVisualCacheEntryValid(entry(args[0]));
      case "write": {
        count(3); if (typeof args[1] !== "string" || args[1].length > Math.ceil(maximumCacheImageBytes / 3) * 4) return invalid();
        const image = Buffer.from(args[1], "base64");
        if (image.length > maximumCacheImageBytes || image.toString("base64") !== args[1]) return invalid();
        return store.writeVisualCacheEntry(entry(args[0]), image, mime(args[2]));
      }
      case "read": {
        count(1); const image = await store.readVisualCacheImage(filePath(args[0]));
        if (image.buffer.length > maximumCacheImageBytes) throw new Error("core-cache-image-too-large");
        return { base64: image.buffer.toString("base64"), mimeType: image.mimeType };
      }
      case "deleteImage": count(2); return store.deleteVisualCacheImage(filePath(args[0]), cacheType(args[1]));
      case "deleteSourcesByType": count(2); return store.deleteVisualCachesForImagesByType(paths(args[0]), cacheType(args[1]));
      case "deleteSources": count(1); return store.deleteVisualCachesForImages(paths(args[0]));
      case "deleteDirectory": count(1); return store.deleteVisualCachesForDirectory(filePath(args[0]));
      default: return invalid();
    }
  };
  return { dispatch, close: () => { keywords.close(); metadata.close(); visuals.close(); } };
};
