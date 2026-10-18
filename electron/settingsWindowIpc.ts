import type { IpcMainInvokeEvent } from "electron";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import { createSettingsMetadataBuildRequest } from "./settingsMetadataBuildRequest";

interface SettingsWindowIpcDependencies {
  registrar: IpcRegistrar;
  isMainSenderAllowed: (event: IpcMainInvokeEvent) => boolean;
  isSettingsSenderAllowed: (event: IpcMainInvokeEvent) => boolean;
  openSettings: () => Promise<boolean>;
  notifyMetadataBuild?: () => void;
}
export const registerSettingsWindowIpc = ({ registrar, isMainSenderAllowed, isSettingsSenderAllowed, openSettings, notifyMetadataBuild }: SettingsWindowIpcDependencies) => {
  const metadata = createSettingsMetadataBuildRequest(openSettings, notifyMetadataBuild);
  registerIpcDomain({
    registrar,
    registrations: [{
      kind: "handle",
      channel: "settingsWindow:open",
      listener: (event) => isMainSenderAllowed(event) ? openSettings() : false
    }, {
      kind: "handle",
      channel: "settingsWindow:openMetadataBuild",
      listener: event => isMainSenderAllowed(event) || isSettingsSenderAllowed(event) ? metadata.request() : false
    }, {
      kind: "handle", channel: "settingsWindow:consumeMetadataBuildRequest",
      listener: event => isSettingsSenderAllowed(event) ? metadata.consume() : false
    }]
  });
};
