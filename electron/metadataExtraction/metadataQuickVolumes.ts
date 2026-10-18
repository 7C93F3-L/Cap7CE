import type { CoreCatalogStatus } from "../core/coreProductProtocolTypes";
import type { MetadataDirectoryJob } from "../metadataDirectoryBuildStore";

// Only Main-owned Catalog volumes can become a quick whole-disk grant. Saved custom policy is not consulted.
export function metadataQuickVolumeJobs(catalog: CoreCatalogStatus): MetadataDirectoryJob[] {
  const volumes = catalog.volumes.filter(volume => volume.selected
    && (volume.queryable || ["building", "discovering", "catchingUp"].includes(volume.state)));
  if (!volumes.length || volumes.some(volume => !/^[A-Za-z]:[\\/]?$/.test(volume.displayName)))
    throw new Error("metadata-directory-unavailable");
  return volumes.map(volume => ({ path: `${volume.displayName.slice(0, 2).toUpperCase()}\\`,
    scope: { volumeId: volume.volumeId, rootFileReference: null } }));
}
