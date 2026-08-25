import { app, crashReporter } from "electron";
import type { WebContents } from "electron";
import { RuntimeDiagnostics } from "./runtimeDiagnostics";

const describeWebContents = (webContents: WebContents) => ({
  id: webContents.id,
  type: webContents.getType(),
  destroyed: webContents.isDestroyed()
});

export const bootstrapRuntimeDiagnostics = (): RuntimeDiagnostics => {
  const diagnostics = new RuntimeDiagnostics({ userDataPath: app.getPath("userData") });
  app.setPath("crashDumps", diagnostics.crashDirectory);
  crashReporter.start({
    productName: app.getName(),
    companyName: "7C",
    uploadToServer: false,
    globalExtra: {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      platform: process.platform,
      arch: process.arch
    }
  });

  void diagnostics.initialize();
  process.on("uncaughtExceptionMonitor", (error, origin) => {
    diagnostics.log("error", "process.uncaught_exception", { origin, error });
  });
  process.on("unhandledRejection", (reason) => {
    diagnostics.log("error", "process.unhandled_rejection", { reason });
  });
  app.on("render-process-gone", (_event, webContents, details) => {
    diagnostics.log("error", "electron.render_process_gone", {
      webContents: describeWebContents(webContents),
      reason: details.reason,
      exitCode: details.exitCode
    });
  });
  app.on("child-process-gone", (_event, details) => {
    diagnostics.log("error", "electron.child_process_gone", {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName,
      name: details.name
    });
  });
  app.on("web-contents-created", (_event, webContents) => {
    webContents.on("unresponsive", () => {
      diagnostics.log("warn", "electron.web_contents_unresponsive", describeWebContents(webContents));
    });
    webContents.on("responsive", () => {
      diagnostics.log("info", "electron.web_contents_responsive", describeWebContents(webContents));
    });
    webContents.on("preload-error", (_preloadEvent, preloadPath, error) => {
      diagnostics.log("error", "electron.preload_error", { preloadPath, error });
    });
  });
  app.on("before-quit", () => diagnostics.markCleanExitSync());
  return diagnostics;
};
