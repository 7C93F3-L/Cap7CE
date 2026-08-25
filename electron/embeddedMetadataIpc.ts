import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import type { EmbeddedMetadataTaskStatus } from "./embeddedMetadataService";

interface EmbeddedMetadataIpcDependencies {
  registrar: IpcRegistrar;
  isSenderAllowed: (event: Electron.IpcMainInvokeEvent) => boolean;
  getStatus: () => EmbeddedMetadataTaskStatus;
  startBackfill: () => Promise<EmbeddedMetadataTaskStatus>;
  cancelBackfill: () => Promise<boolean>;
}

export const registerEmbeddedMetadataIpc = ({
  registrar,
  isSenderAllowed,
  getStatus,
  startBackfill,
  cancelBackfill
}: EmbeddedMetadataIpcDependencies) => registerIpcDomain({
  registrar,
  isSenderAllowed,
  registrations: [
    { kind: "handle", channel: "embeddedMetadata:status", listener: getStatus },
    { kind: "handle", channel: "embeddedMetadata:startBackfill", listener: startBackfill },
    { kind: "handle", channel: "embeddedMetadata:cancelBackfill", listener: cancelBackfill }
  ]
});
