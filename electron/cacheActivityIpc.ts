import type { IpcMainInvokeEvent } from "electron";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";

export interface CacheActivityIpcDependencies {
  registrar: IpcRegistrar;
  isMainSenderAllowed: (event: IpcMainInvokeEvent) => boolean;
  getCacheStats: () => unknown;
  getOptimizationStatus: () => unknown;
  setContentViewActive: (active: boolean) => void;
  discardQueuedInteractiveThumbnails: () => number;
  setGridInteractionActive: (active: boolean) => void;
}

export const registerCacheActivityIpc = ({
  registrar,
  isMainSenderAllowed,
  getCacheStats,
  getOptimizationStatus,
  setContentViewActive,
  discardQueuedInteractiveThumbnails,
  setGridInteractionActive
}: CacheActivityIpcDependencies): void => {
  registerIpcDomain({
    registrar,
    registrations: [
      {
        kind: "handle",
        channel: "cache:stats",
        listener: () => getCacheStats()
      },
      {
        kind: "handle",
        channel: "cache:optimizationStatus",
        listener: () => getOptimizationStatus()
      },
      {
        kind: "handle",
        channel: "cache:setContentViewActive",
        listener: (event, active: unknown) => {
          if (!isMainSenderAllowed(event)) return false;
          setContentViewActive(active === true);
          return true;
        }
      },
      {
        kind: "handle",
        channel: "cache:discardQueuedInteractiveThumbnails",
        listener: (event) => {
          if (!isMainSenderAllowed(event)) return 0;
          return discardQueuedInteractiveThumbnails();
        }
      },
      {
        kind: "handle",
        channel: "cache:setGridInteractionActive",
        listener: (event, active: unknown) => {
          if (!isMainSenderAllowed(event)) return false;
          setGridInteractionActive(active === true);
          return true;
        }
      }
    ]
  });
};
