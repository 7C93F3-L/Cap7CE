import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import type { RuntimeDiagnostics } from "./runtimeDiagnostics";
import { exportRuntimeDiagnosticBundle } from "./runtimeDiagnosticBundle";

type RuntimeDiagnosticsExportResult =
  | { status: "exported"; filePath: string }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

export interface RegisterDiagnosticsIpcOptions {
  registrar: IpcRegistrar;
  isSenderAllowed: (event: IpcMainInvokeEvent) => boolean;
  diagnostics: RuntimeDiagnostics;
  appVersion: string;
  documentsPath: string;
  additionalLogPaths: string[];
  chooseExportPath: (defaultPath: string) => Promise<string | null>;
}

const exportFileName = () => {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `Cap7CE-diagnostics-${timestamp}.zip`;
};

export const registerDiagnosticsIpc = ({
  registrar,
  isSenderAllowed,
  diagnostics,
  appVersion,
  documentsPath,
  additionalLogPaths,
  chooseExportPath
}: RegisterDiagnosticsIpcOptions): void => {
  registerIpcDomain({
    registrar,
    isSenderAllowed,
    registrations: [
      {
        kind: "handle",
        channel: "diagnostics:getInfo",
        listener: () => diagnostics.getInfo()
      },
      {
        kind: "handle",
        channel: "diagnostics:setDetailedLogging",
        listener: (_event, enabled: unknown) => {
          if (typeof enabled !== "boolean") throw new Error("Invalid detailed logging state.");
          return diagnostics.setDetailedLoggingEnabled(enabled);
        }
      },
      {
        kind: "handle",
        channel: "diagnostics:export",
        listener: async (): Promise<RuntimeDiagnosticsExportResult> => {
          const destinationPath = await chooseExportPath(path.join(documentsPath, exportFileName()));
          if (!destinationPath) return { status: "cancelled" };
          const operation = diagnostics.startOperation("diagnostics.export");
          try {
            await exportRuntimeDiagnosticBundle({
              diagnostics,
              destinationPath,
              appVersion,
              additionalLogPaths
            });
            operation.complete();
            return { status: "exported", filePath: destinationPath };
          } catch (error) {
            operation.fail(error);
            return { status: "failed", message: "Unable to export diagnostics." };
          }
        }
      }
    ]
  });
};
