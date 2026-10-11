import type { IpcMainInvokeEvent } from "electron";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";

interface SettingsWindowIpcDependencies {
  registrar: IpcRegistrar;
  isMainSenderAllowed: (event: IpcMainInvokeEvent) => boolean;
  isSettingsSenderAllowed: (event: IpcMainInvokeEvent) => boolean;
  openSettings: () => Promise<boolean>;
  openMetadataBuild: () => boolean;
}

export const registerSettingsWindowIpc = ({ registrar, isMainSenderAllowed, isSettingsSenderAllowed, openSettings, openMetadataBuild }: SettingsWindowIpcDependencies) => {
  registerIpcDomain({
    registrar,
    registrations: [{
      kind: "handle",
      channel: "settingsWindow:open",
      listener: (event) => isMainSenderAllowed(event) ? openSettings() : false
    }, {
      kind: "handle",
      channel: "settingsWindow:openMetadataBuild",
      listener: (event) => isSettingsSenderAllowed(event) ? openMetadataBuild() : false
    }]
  });
};
