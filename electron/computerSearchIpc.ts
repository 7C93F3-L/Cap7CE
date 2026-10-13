import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from "electron";
import type { SkimPreviewInfo } from "./skimPreviewService";
import type { SkimTextPreviewResult } from "./skimContentPreviewService";
import type {
  ComputerSearchAuthorization, ComputerSearchAuthorizationBatch,
  ComputerSearchCapabilityRequest, ComputerSearchNextPageRequest, ComputerSearchRequest
} from "./computerSearchTypes";
import type { ComputerSearchRuntime } from "./computerSearchRuntime";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import { registerMetadataBuildIpc } from "./metadataExtraction/metadataBuildIpc";
import { readComputerSearchFacts } from "./computerSearchFactConditions";
import { readComputerSearchFileConditions } from "./computerSearchFileConditions";
import { registerComputerSearchChangeIpc } from "./computerSearchChangeIpc";
import { registerFavoriteDirectoryIpc } from "./favoriteDirectories/favoriteDirectoryIpc";
import { registerComputerSearchThumbnailIpc } from "./computerSearchThumbnailIpc";

export interface RegisterComputerSearchIpcOptions {
  registrar: IpcRegistrar;
  isSenderAllowed: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean;
  isActionSenderAllowed: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean;
  runtime: ComputerSearchRuntime;
  openPath: (filePath: string) => Promise<string>;
  showItemInFolder: (filePath: string) => void;
  writeClipboardText: (text: string) => void;
  inspectItem: (filePath: string, kind: "file" | "folder") => Promise<SkimPreviewInfo>;
  readTextPreview: (filePath: string) => Promise<SkimTextPreviewResult>;
  startFileDrag: (sender: WebContents, filePaths: string[]) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isTaskId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

const readSearchRequest = (value: unknown): ComputerSearchRequest => {
  if (!isRecord(value) || !isTaskId(value.taskId) || typeof value.query !== "string"
    || value.query.length > 512
    || !(value.scopePath === null || (typeof value.scopePath === "string"
      && value.scopePath.length <= 32767 && /^[A-Za-z]:\\/.test(value.scopePath)))) {
    throw new Error("computer-search-invalid-request");
  }
  const facts = readComputerSearchFacts(value.facts);
  const fileConditions = readComputerSearchFileConditions(value.fileConditions);
  if (value.scopeKind !== undefined && (value.scopeKind !== "direct-children" || value.scopePath === null))
    throw new Error("computer-search-invalid-request");
  if (value.sort !== undefined && (typeof value.sort !== "string" || !["name-ascending", "name-descending", "modified-ascending", "modified-descending"].includes(value.sort))
    || value.excludeHidden !== undefined && typeof value.excludeHidden !== "boolean") throw new Error("computer-search-invalid-request");
  return { taskId: value.taskId, query: value.query.trim(), scopePath: value.scopePath,
    ...(value.sort ? { sort: value.sort as ComputerSearchRequest["sort"] } : {}),
    ...(value.excludeHidden !== undefined ? { excludeHidden: value.excludeHidden as boolean } : {}),
    ...(value.scopeKind ? { scopeKind: value.scopeKind as "direct-children" } : {}),
    ...(facts ? { facts } : {}), ...(fileConditions ? { fileConditions } : {}) };
};

const readNextPageRequest = (value: unknown): ComputerSearchNextPageRequest => {
  if (!isRecord(value) || !isTaskId(value.taskId) || typeof value.cursor !== "string"
    || value.cursor.length < 1 || value.cursor.length > 65_536) {
    throw new Error("computer-search-invalid-cursor");
  }
  return { taskId: value.taskId, cursor: value.cursor };
};

const readCapabilityRequest = (value: unknown): ComputerSearchCapabilityRequest => {
  if (!isRecord(value) || !["enable", "repair", "remove"].includes(String(value.action))
    || typeof value.removeCatalog !== "boolean" || !Array.isArray(value.volumeLetters)
    || value.volumeLetters.length > 26 || !value.volumeLetters.every((letter) => typeof letter === "string"
      && /^[A-Z]$/.test(letter)) || new Set(value.volumeLetters).size !== value.volumeLetters.length
    || (value.action === "remove" && value.volumeLetters.length !== 0)
    || (value.action !== "remove" && value.volumeLetters.length === 0)) {
    throw new Error("computer-search-invalid-capability-request");
  }
  return { action: value.action as ComputerSearchCapabilityRequest["action"],
    volumeLetters: [...value.volumeLetters] as string[], removeCatalog: value.removeCatalog };
};

const readAuthorization = (value: unknown): ComputerSearchAuthorization => {
  if (!isRecord(value) || !isTaskId(value.taskId) || typeof value.authorizationId !== "string"
    || !/^[A-Za-z0-9_-]{32,128}$/.test(value.authorizationId)) {
    throw new Error("computer-search-invalid-authorization");
  }
  return { taskId: value.taskId, authorizationId: value.authorizationId };
};

const readAuthorizationBatch = (value: unknown): ComputerSearchAuthorizationBatch => {
  if (!isRecord(value) || !isTaskId(value.taskId) || !Array.isArray(value.authorizationIds)
    || value.authorizationIds.length < 1 || value.authorizationIds.length > 200
    || !value.authorizationIds.every((authorizationId) => typeof authorizationId === "string"
      && /^[A-Za-z0-9_-]{32,128}$/.test(authorizationId))) {
    throw new Error("computer-search-invalid-authorization");
  }
  return { taskId: value.taskId, authorizationIds: [...new Set(value.authorizationIds as string[])] };
};

const requireAuthorizedItem = (runtime: ComputerSearchRuntime, value: unknown) => {
  const request = readAuthorization(value);
  const item = runtime.resolveAuthorizedItem(request);
  if (!item) throw new Error("computer-search-authorization-expired");
  return item;
};

const requireAuthorizedItems = (runtime: ComputerSearchRuntime, value: unknown) => {
  const request = readAuthorizationBatch(value);
  const items = runtime.resolveAuthorizedItems(request);
  if (!items) throw new Error("computer-search-authorization-expired");
  return items;
};

export const registerComputerSearchIpc = ({
  registrar, isSenderAllowed, isActionSenderAllowed, runtime, openPath, showItemInFolder, writeClipboardText,
  inspectItem, readTextPreview, startFileDrag
}: RegisterComputerSearchIpcOptions): void => {
  registerComputerSearchChangeIpc(registrar, isSenderAllowed, runtime);
  registerComputerSearchThumbnailIpc({ registrar, isSenderAllowed, runtime });
  if (runtime.favoriteDirectories) registerFavoriteDirectoryIpc(registrar, isSenderAllowed, runtime.favoriteDirectories);
  if (runtime.metadataBuild) registerMetadataBuildIpc(registrar, isSenderAllowed, runtime.metadataBuild);
  registerIpcDomain({
    registrar,
    isSenderAllowed,
    registrations: [
    { kind: "handle", channel: "computerSearch:status", listener: () => runtime.status() },
    { kind: "handle", channel: "computerSearch:capabilityOptions", listener: () => runtime.capabilityOptions() },
    { kind: "handle", channel: "computerSearch:configureCapability", listener: (_event, value) =>
      runtime.configureCapability(readCapabilityRequest(value)) },
    { kind: "handle", channel: "computerSearch:search", listener: (_event, value) => runtime.search(readSearchRequest(value)) },
    { kind: "handle", channel: "computerSearch:nextPage", listener: (_event, value) => runtime.nextPage(readNextPageRequest(value)) },
    { kind: "handle", channel: "computerSearch:cancel", listener: (_event, taskId) => {
      if (!isTaskId(taskId)) throw new Error("computer-search-invalid-task");
      return runtime.cancel(taskId);
    } }
    ]
  });
  registerIpcDomain({
    registrar,
    isSenderAllowed: isActionSenderAllowed,
    registrations: [
    { kind: "handle", channel: "computerSearch:open", listener: (_event, value) =>
      openPath(requireAuthorizedItem(runtime, value).path) },
    { kind: "handle", channel: "computerSearch:showInFolder", listener: (_event, value) => {
      showItemInFolder(requireAuthorizedItem(runtime, value).path);
      return true;
    } },
    { kind: "handle", channel: "computerSearch:copyPaths", listener: (_event, value) => {
      const items = requireAuthorizedItems(runtime, value);
      writeClipboardText(items.map((item) => item.path).join("\r\n"));
      return items.length;
    } },
    { kind: "handle", channel: "computerSearch:inspect", listener: (_event, value) => {
      const item = requireAuthorizedItem(runtime, value);
      return inspectItem(item.path, item.isDirectory ? "folder" : "file");
    } },
    { kind: "handle", channel: "computerSearch:readTextPreview", listener: (_event, value) => {
      const item = requireAuthorizedItem(runtime, value);
      if (item.isDirectory) throw new Error("computer-search-preview-not-file");
      return readTextPreview(item.path);
    } },
    { kind: "on", channel: "computerSearch:startDrag", listener: (event, value) => {
      try {
        const items = requireAuthorizedItems(runtime, value);
        startFileDrag(event.sender, items.map((item) => item.path));
      } catch {
        // Native drag is best-effort; invalid or expired result capabilities are ignored.
      }
    } }
    ]
  });
};
