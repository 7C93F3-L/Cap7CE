import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import type { MetadataBuildApi, MetadataBuildPolicy } from "../../src/shared/metadataBuildTypes";
import { registerIpcDomain, type IpcRegistrar } from "../ipcRegistration";
import { directoryBuildPath } from "../metadataDirectoryBuildStore";

const readStart = (value: unknown): { allowMetadataExtraction: boolean; policy: MetadataBuildPolicy } => {
  const request = value as { allowMetadataExtraction?: unknown; policy?: MetadataBuildPolicy } | null;
  const policy = request?.policy;
  if (request?.allowMetadataExtraction !== true || !policy || !Array.isArray(policy.volumeOrder)
    || policy.volumeOrder.length > 64 || !Array.isArray(policy.includes) || !Array.isArray(policy.excludes)
    || policy.includes.length + policy.excludes.length > 256
    || policy.volumeOrder.some((id) => typeof id !== "string" || !/^[A-Fa-f0-9]{32}$/.test(id))
    || [...policy.includes, ...policy.excludes].some((scope) => !scope || !/^[A-Fa-f0-9]{32}$/.test(scope.volumeId)
      || (scope.rootFileReference !== null && (typeof scope.rootFileReference !== "string" || !/^[A-Fa-f0-9]{16}$/.test(scope.rootFileReference))))) {
    throw new Error("metadata-build-invalid-start");
  }
  return { allowMetadataExtraction: true, policy };
};
export const registerMetadataBuildIpc = (registrar: IpcRegistrar,
  isSenderAllowed: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean, runtime: MetadataBuildApi): void => {
  registerIpcDomain({ registrar, isSenderAllowed, registrations: [
    { kind: "handle", channel: "metadataBuild:resolveScope", listener: (_event, path) => {
      if (typeof path !== "string" || path.length > 32768 || !/^[A-Za-z]:[\\/]/.test(path)) throw new Error("metadata-build-invalid-directory");
      return runtime.resolveScope(path);
    } },
    { kind: "handle", channel: "metadataBuild:status", listener: () => runtime.status() },
    { kind: "handle", channel: "metadataBuild:start", listener: (_event, value) => runtime.start(readStart(value)) },
    { kind: "handle", channel: "metadataBuild:pause", listener: () => runtime.pause() },
    { kind: "handle", channel: "metadataBuild:resume", listener: () => runtime.resume() },
    { kind: "handle", channel: "metadataBuild:startDirectory", listener: (_event, value) => {
      if (value?.allowMetadataExtraction !== true) throw new Error("metadata-build-confirmation-required");
      return runtime.startDirectory({ path: directoryBuildPath(value.path), allowMetadataExtraction: true });
    } },
    { kind: "handle", channel: "metadataBuild:cancelDirectories", listener: () => runtime.cancelDirectories() }
  ] });
};
