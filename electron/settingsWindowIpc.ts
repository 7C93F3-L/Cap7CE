import type { IpcMainInvokeEvent } from "electron";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";

interface SettingsWindowIpcDependencies {
  registrar: IpcRegistrar;
  isMainSenderAllowed: (event: IpcMainInvokeEvent) => boolean;
  openSettings: () => Promise<boolean>;
}

export const registerSettingsWindowIpc = ({ registrar, isMainSenderAllowed, openSettings }: SettingsWindowIpcDependencies) => {
  registerIpcDomain({
    registrar,
    registrations: [{
      kind: "handle",
      channel: "settingsWindow:open",
      listener: (event) => isMainSenderAllowed(event) ? openSettings() : false
    }]
  });
};
