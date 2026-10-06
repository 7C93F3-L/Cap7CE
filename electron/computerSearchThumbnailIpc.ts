import type { RegisterComputerSearchIpcOptions } from "./computerSearchIpc";
import { registerIpcDomain } from "./ipcRegistration";

export function registerComputerSearchThumbnailIpc({ registrar, isSenderAllowed, runtime }: Pick<RegisterComputerSearchIpcOptions, "registrar" | "isSenderAllowed" | "runtime">) {
  const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
  const task = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  registerIpcDomain({ registrar, isSenderAllowed, registrations: [
    { kind: "handle", channel: "computerSearch:acquireThumbnail", listener: (_event, value) => {
      if (!record(value) || Object.keys(value).length !== 2 || !task(value.taskId) || typeof value.authorizationId !== "string"
        || !/^[A-Za-z0-9_-]{32,128}$/.test(value.authorizationId)) throw new Error("computer-search-invalid-authorization");
      return runtime.thumbnailLeases.acquire({ taskId: value.taskId, authorizationId: value.authorizationId });
    } },
    { kind: "handle", channel: "computerSearch:releaseThumbnail", listener: (_event, value) => {
      if (!record(value) || Object.keys(value).length !== 2 || !task(value.taskId) || typeof value.leaseId !== "string"
        || !/^[A-Za-z0-9_-]{32}$/.test(value.leaseId)) throw new Error("computer-search-invalid-thumbnail-lease");
      return runtime.thumbnailLeases.release(value.taskId, value.leaseId);
    } }
  ] });
}
