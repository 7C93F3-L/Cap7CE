import { readPreviewEmbeddedMetadata } from "./sqliteImageIndex";
import { readVisualSourceDimensions } from "./visualSourceDimensions";
import { startEmbeddedMetadataPreviewProbe, type EmbeddedMetadataPreviewProbe } from "./embeddedMetadataPreviewProbe";
import type { SkimPreviewInfo } from "./skimPreviewService";
import type { CatalogFileDetails } from "../src/shared/fileInformationTypes";

interface Job { key: string; path: string; cancelled: boolean; resolve: (value: CatalogFileDetails | null) => void; }
interface Dependencies {
  inspect: (filePath: string) => Promise<SkimPreviewInfo>;
  readStored?: typeof readPreviewEmbeddedMetadata;
  readDimensions?: typeof readVisualSourceDimensions;
  startProbe?: typeof startEmbeddedMetadataPreviewProbe;
}
// One running read and one replaceable pending selection. No persistent cache or indexing.
export function createCatalogFileDetailsReader({ inspect, readStored = readPreviewEmbeddedMetadata,
  readDimensions = readVisualSourceDimensions, startProbe = startEmbeddedMetadataPreviewProbe }: Dependencies) {
  let active: Job | null = null, pending: Job | null = null, probe: EmbeddedMetadataPreviewProbe | null = null;
  const cancelJob = (job: Job | null) => { if (job) { job.cancelled = true; job.resolve(null); } };
  const pump = async () => {
    if (active || !pending) return;
    const job = pending; pending = null; active = job;
    try {
      const info = await inspect(job.path);
      if (job.cancelled || info.kind !== "file") return;
      const stored = await readStored(info.path, { fileSize: info.size, modifiedAt: info.modifiedAt }).catch(() => ({ metadata: null, isCurrent: false }));
      if (job.cancelled) return;
      probe = stored.isCurrent ? null : startProbe({ skimActive: true, info, filePath: info.path });
      const [dimensions, metadata] = await Promise.all([
        readDimensions(info.path).catch(() => null), probe?.result ?? Promise.resolve(stored.metadata)
      ]);
      if (job.cancelled) return;
      const current = await inspect(info.path);
      if (job.cancelled || current.size !== info.size || current.modifiedAt !== info.modifiedAt) return;
      job.resolve({ info, ...(dimensions ? { imageWidth: dimensions.width, imageHeight: dimensions.height } : {}),
        ...(metadata ? { embeddedMetadata: metadata } : {}) });
    } catch { /* Missing, changed and unreadable sources keep the basic Catalog card. */ }
    finally { job.resolve(null); probe?.cancel(); probe = null; active = null; void pump(); }
  };
  const cancel = (key?: string) => {
    if (pending && (!key || pending.key === key)) { cancelJob(pending); pending = null; }
    if (active && (!key || active.key === key)) { cancelJob(active); probe?.cancel(); }
  };
  return {
    read: (key: string, filePath: string) => {
      cancel();
      return new Promise<CatalogFileDetails | null>(resolve => { pending = { key, path: filePath, cancelled: false, resolve }; void pump(); });
    }, cancel
  };
}
