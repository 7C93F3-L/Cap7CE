import type { IpcRenderer } from "electron";
import type { MetadataBuildApi } from "../../src/shared/metadataBuildTypes";
export const createMetadataBuildBridge = (ipc: Pick<IpcRenderer, "invoke"> & Partial<Pick<IpcRenderer, "on" | "removeListener">>): MetadataBuildApi => ({
  resolveScope: (path) => ipc.invoke("metadataBuild:resolveScope", path),
  status: () => ipc.invoke("metadataBuild:status"),
  savePolicy: policy => ipc.invoke("metadataBuild:savePolicy", policy),
  onChanged: callback => { const listener = () => callback(); ipc.on?.("metadataBuild:changed", listener); return () => { ipc.removeListener?.("metadataBuild:changed", listener); }; },
  start: (request) => ipc.invoke("metadataBuild:start", request),
  pause: () => ipc.invoke("metadataBuild:pause"),
  resume: () => ipc.invoke("metadataBuild:resume"),
  startDirectory: request => ipc.invoke("metadataBuild:startDirectory", request),
  cancelDirectories: () => ipc.invoke("metadataBuild:cancelDirectories")
});
