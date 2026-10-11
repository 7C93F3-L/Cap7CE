import type { IpcRenderer } from "electron";
import type { SettingsWindowApi } from "../src/shared/settingsWindowTypes";

export const createSettingsWindowBridge = (ipc: Pick<IpcRenderer, "invoke" | "on" | "removeListener">): SettingsWindowApi => ({
  open: () => ipc.invoke("settingsWindow:open"),
  openMetadataBuild: () => ipc.invoke("settingsWindow:openMetadataBuild"),
  onMetadataBuildRequested: callback => {
    const listener = () => callback();
    ipc.on("settingsWindow:metadataBuildRequested", listener);
    return () => { ipc.removeListener("settingsWindow:metadataBuildRequested", listener); };
  }
});
