import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import type { MetadataBuildApi, MetadataBuildPolicy } from "../../src/shared/metadataBuildTypes";
import { registerIpcDomain, type IpcRegistrar } from "../ipcRegistration";
import { directoryBuildPath } from "../metadataDirectoryBuildStore";

const readPolicy = (value: unknown): MetadataBuildPolicy => {
  const policy = value as MetadataBuildPolicy | null;
  if (!policy || !Array.isArray(policy.volumeOrder) || !policy.volumeOrder.length
    || policy.volumeOrder.length > 64 || new Set(policy.volumeOrder).size !== policy.volumeOrder.length || !Array.isArray(policy.includes) || !Array.isArray(policy.excludes)
    || policy.includes.length + policy.excludes.length > 256
    || policy.volumeOrder.some((id) => typeof id !== "string" || !/^[A-Fa-f0-9]{32}$/.test(id))
    || [...policy.includes, ...policy.excludes].some((scope) => !scope || !/^[A-Fa-f0-9]{32}$/.test(scope.volumeId)
      || !policy.volumeOrder.includes(scope.volumeId) || (scope.rootFileReference !== null && (typeof scope.rootFileReference !== "string" || !/^[A-Fa-f0-9]{16}$/.test(scope.rootFileReference))))) {
    throw new Error("metadata-build-invalid-start");
  }
  return policy;
};
export const registerMetadataBuildIpc = (registrar: IpcRegistrar,
  isSenderAllowed: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean, runtime: MetadataBuildApi,
  options: { isDirectorySenderAllowed?: typeof isSenderAllowed; onChanged?: () => void } = {}): void => {
  let mutating = false;
  const change = async (action: () => Promise<unknown>) => {
    if (mutating) throw new Error("metadata-build-busy");
    mutating = true;
    try { return await action(); } finally { mutating = false; try { options.onChanged?.(); } catch { /* Closed observers do not undo a successful task action. */ } }
  };
  registerIpcDomain({ registrar, isSenderAllowed, registrations: [
    { kind: "handle", channel: "metadataBuild:resolveScope", listener: (_event, path) => {
      if (typeof path !== "string" || path.length > 32768 || !/^[A-Za-z]:[\\/]/.test(path)) throw new Error("metadata-build-invalid-directory");
      return runtime.resolveScope(path);
    } },
    { kind: "handle", channel: "metadataBuild:status", listener: () => runtime.status() },
    { kind: "handle", channel: "metadataBuild:savePolicy", listener: (_event, value) => change(() => runtime.savePolicy(readPolicy(value))) },
    { kind: "handle", channel: "metadataBuild:start", listener: (_event, value) => change(() => {
      if (value?.allowMetadataExtraction !== true) throw new Error("metadata-build-confirmation-required");
      return runtime.start({ allowMetadataExtraction: true, policy: readPolicy(value.policy) });
    }) },
    { kind: "handle", channel: "metadataBuild:pause", listener: () => change(() => runtime.pause()) },
    { kind: "handle", channel: "metadataBuild:resume", listener: () => change(() => runtime.resume()) },
    { kind: "handle", channel: "metadataBuild:startDirectory", listener: (event, value) => {
      if (!(options.isDirectorySenderAllowed ?? isSenderAllowed)(event)) throw new Error("metadata-build-not allowed");
      if (value?.allowMetadataExtraction !== true) throw new Error("metadata-build-confirmation-required");
      return change(() => runtime.startDirectory({ path: directoryBuildPath(value.path), allowMetadataExtraction: true }));
    } },
    { kind: "handle", channel: "metadataBuild:startAllVolumes", listener: (event, value) => {
      if (!(options.isDirectorySenderAllowed ?? isSenderAllowed)(event)) throw new Error("metadata-build-not allowed");
      if (value?.allowMetadataExtraction !== true) throw new Error("metadata-build-confirmation-required");
      return change(() => runtime.startAllVolumes({ allowMetadataExtraction: true }));
    } },
    { kind: "handle", channel: "metadataBuild:cancelDirectories", listener: () => change(() => runtime.cancelDirectories()) }
  ] });
};
