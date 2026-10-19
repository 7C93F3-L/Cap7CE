import type { ComputerSearchStatus } from "../../../electron/computerSearchTypes";
export function computerSearchAvailability(status: ComputerSearchStatus | null, currentPath: string | null) {
  const volume = currentPath ? status?.volumes.find(volume => volume.displayName.toLowerCase() === currentPath.slice(0, 2).toLowerCase()) : undefined;
  return {
    canSearch: Boolean(status?.searchAvailable && (!volume || volume.queryable)),
    canBrowse: Boolean(currentPath && status && volume && ["starting", "building", "syncing"].includes(status.state) && volume.state !== "offline")
  };
}
