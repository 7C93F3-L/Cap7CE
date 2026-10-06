import type { IpcRenderer } from "electron";
import type { MetadataBuildApi } from "../../src/shared/metadataBuildTypes";
export const createMetadataBuildBridge = (ipc: Pick<IpcRenderer, "invoke">): MetadataBuildApi => ({
  resolveScope: (path) => ipc.invoke("metadataBuild:resolveScope", path),
  status: () => ipc.invoke("metadataBuild:status"),
  start: (request) => ipc.invoke("metadataBuild:start", request),
  pause: () => ipc.invoke("metadataBuild:pause"),
  resume: () => ipc.invoke("metadataBuild:resume")
});
