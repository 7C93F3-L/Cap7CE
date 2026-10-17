import type { CoreCatalogStatus, CoreResolvedScope } from "../core/coreProductProtocolTypes";
import type { MetadataDirectoryJob } from "../metadataDirectoryBuildStore";
import { metadataBuildDelay } from "./metadataBuildProgress";

export async function resolveMetadataDirectory(job: MetadataDirectoryJob, readCatalog: () => Promise<CoreCatalogStatus>,
  resolve: ((path: string) => Promise<CoreResolvedScope>) | undefined, signal: AbortSignal, waiting: () => void, waitMs = 1000) {
  if (!resolve) throw new Error("metadata-directory-unavailable");
  while (true) {
    signal.throwIfAborted();
    const catalog = await readCatalog();
    const volume = catalog.volumes.find(volume => volume.displayName.slice(0, 2).toLowerCase() === job.path.slice(0, 2).toLowerCase());
    if (!volume?.selected) throw new Error("metadata-directory-unavailable");
    const scope = await resolve(job.path); signal.throwIfAborted();
    if (scope.resolved && scope.queryable && scope.volumeId) {
      if (job.scope && (job.scope.volumeId.toLowerCase() !== scope.volumeId.toLowerCase()
        || job.scope.rootFileReference?.toLowerCase() !== scope.rootFileReference?.toLowerCase())) throw new Error("metadata-directory-changed");
      return { volumeId: scope.volumeId, rootFileReference: scope.rootFileReference };
    }
    if (!["building", "discovering", "catchingUp"].includes(scope.state ?? volume.state)) throw new Error("metadata-directory-unavailable");
    waiting(); await metadataBuildDelay(waitMs, signal);
  }
}
