import type { CoreCatalogStatus, CoreVolumeList } from "./core/coreProductProtocolTypes";

interface CoreCatalogRequestClient {
  request<T>(operation: string, body: Record<string, unknown>, deadlineMs?: number): Promise<T>;
}

export const startComputerSearchCatalogSynchronization = async (
  controller: CoreCatalogRequestClient
): Promise<CoreCatalogStatus> => {
  const discovered = await controller.request<CoreVolumeList>("volume.list", {}, 30_000);
  const volumeIds = discovered.volumes.map((volume) => volume.volumeId);
  if (volumeIds.length === 0) {
    return controller.request<CoreCatalogStatus>("catalog.status", {}, 5_000);
  }
  await controller.request("volume.selection", { volumeIds }, 5_000);
  const catalog = await controller.request<CoreCatalogStatus>("catalog.status", {}, 5_000);
  if (!catalog.tasks.some((task) => task.state === "running")) {
    await controller.request("catalog.build", { volumeIds }, 5_000);
  }
  return controller.request<CoreCatalogStatus>("catalog.status", {}, 5_000);
};
