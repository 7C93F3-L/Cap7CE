import { AppUpdateDownloadService } from "./domain/appUpdateDownloadService";
import { checkForAppUpdate } from "./domain/appUpdateService";
import type { CoreNodeService } from "../transport/server";

// Reuse the tested downloader, resume and digest rules; the UI launches the installer.
export function createNativeUpdateService(directory: string, version: string,
  fetchReleases: typeof fetch = fetch, fetchDownload: typeof fetch = fetch): CoreNodeService {
  let lastError: string | null = null, installer: string | null = null;
  let downloading: Promise<unknown> | null = null;
  const service = new AppUpdateDownloadService({
    rootDirectory: directory, currentVersion: version, installerKind: "winui", fetchDownload,
    openInstaller: async file => { installer = file; return ""; },
    onProgress: () => {}, diagnostics: { log: () => {} }
  });
  const initialized = service.initialize();
  const state = () => ({ ...service.getState(), busy: downloading !== null, error: lastError });
  return {
    async dispatch(method, args) {
      if (!Array.isArray(args) || args.length !== 0) throw new Error("invalid-update-arguments");
      await initialized;
      switch (method) {
        case "state": return state();
        case "check": {
          if (downloading) return { status: "busy", downloadState: state() };
          const result = await checkForAppUpdate(version, fetchReleases, "winui");
          if (result.asset) await service.setAvailableAsset(result.asset);
          else if (result.status === "up_to_date") await service.setAvailableAsset(null);
          return { status: result.status, latestVersion: result.latestVersion, reason: result.reason, downloadState: state() };
        }
        case "download":
          if (!downloading) {
            lastError = null;
            downloading = service.download().catch(error => { lastError = String(error.code ?? "unknown"); })
              .finally(() => { downloading = null; });
          }
          return state();
        case "pause": service.pause(); return state();
        case "installer": {
          if (downloading) throw new Error("update-download-busy");
          installer = null;
          const result = await service.openReadyInstaller(); // Rechecks SHA-256 before handing off.
          return { ...result, installer };
        }
        default: throw new Error("unknown-update-operation");
      }
    },
    async close() { service.pause(); await downloading; }
  };
}
