import type { IpcMainInvokeEvent } from "electron";
import { checkForAppUpdate } from "./appUpdateService";
import { AppUpdateDownloadError, type AppUpdateDownloadService } from "./appUpdateDownloadService";

interface IpcRegistrar {
  handle(channel: string, listener: (event: IpcMainInvokeEvent) => unknown): unknown;
}

export interface AppUpdateIpcDependencies {
  registrar: IpcRegistrar;
  isSenderAllowed: (event: IpcMainInvokeEvent) => boolean;
  currentVersion: string;
  isPackaged: boolean;
  service: AppUpdateDownloadService;
  requestQuit: () => void;
  fetchReleases?: typeof fetch;
}

const failureResult = (error: unknown) => ({
  status: "failed" as const,
  reason: error instanceof AppUpdateDownloadError ? error.code : "unknown" as const
});

export const registerAppUpdateIpc = ({
  registrar,
  isSenderAllowed,
  currentVersion,
  isPackaged,
  service,
  requestQuit,
  fetchReleases
}: AppUpdateIpcDependencies): void => {
  registrar.handle("app:getUpdateState", (event) => (
    isSenderAllowed(event) ? service.getState() : { status: "idle" }
  ));

  registrar.handle("app:checkForUpdates", async (event) => {
    if (!isSenderAllowed(event)) return { status: "failed", currentVersion };
    const result = await checkForAppUpdate(currentVersion, fetchReleases);
    if (result.status === "update_available" && result.asset) {
      await service.setAvailableAsset(result.asset);
    } else if (result.status === "up_to_date") {
      await service.setAvailableAsset(null);
    }
    return {
      status: result.status,
      currentVersion: result.currentVersion,
      ...(result.latestVersion ? { latestVersion: result.latestVersion } : {}),
      downloadState: service.getState()
    };
  });

  registrar.handle("app:downloadUpdate", async (event) => {
    if (!isSenderAllowed(event)) return { status: "failed", reason: "invalid" };
    if (!isPackaged) return { status: "unsupported" };
    if (service.isBusy()) return { ...service.getState(), status: "busy" as const };
    try {
      return await service.download();
    } catch (error) {
      const failure = failureResult(error);
      return error instanceof AppUpdateDownloadError && error.code === "cancelled"
        ? { ...service.getState(), status: "paused" as const }
        : { ...service.getState(), ...failure };
    }
  });

  registrar.handle("app:pauseUpdateDownload", (event) => isSenderAllowed(event) && service.pause());

  registrar.handle("app:discardUpdate", async (event) => {
    if (!isSenderAllowed(event) || service.isBusy()) return false;
    await service.discard();
    return true;
  });

  registrar.handle("app:installUpdate", async (event) => {
    if (!isSenderAllowed(event) || !isPackaged || service.isBusy()) return { status: "failed", reason: "invalid" };
    try {
      const result = await service.openReadyInstaller();
      if (result.status === "installing") requestQuit();
      return result;
    } catch (error) {
      return failureResult(error);
    }
  });
};
