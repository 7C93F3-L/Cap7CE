import type { IpcMainInvokeEvent } from "electron";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import type { AiSearchStartRequest, AiSearchStartResponse, AiSearchUpdate } from "./aiSearchService";
import { t } from "./localization";

export interface AiSearchIpcDependencies {
  registrar: IpcRegistrar;
  isMainSenderAllowed: (event: IpcMainInvokeEvent) => boolean;
  startSearch: (
    request: AiSearchStartRequest,
    emit: (update: AiSearchUpdate) => void
  ) => Promise<AiSearchStartResponse>;
  cancelSearch: (sessionId: string, discard: boolean) => boolean;
}

const isSearchState = (value: unknown): value is AiSearchStartRequest["search"] => {
  if (!value || typeof value !== "object") return false;
  const search = value as Record<string, unknown>;
  return typeof search.query === "string"
    && typeof search.directoryId === "string"
    && typeof search.fileFormat === "string"
    && (search.sortField === "file_name" || search.sortField === "modified_at")
    && (search.sortDirection === "asc" || search.sortDirection === "desc")
    && (search.includedExtensions === undefined || (
      Array.isArray(search.includedExtensions)
      && search.includedExtensions.every((extension) => typeof extension === "string")
    ));
};

const parseStartRequest = (value: unknown): AiSearchStartRequest => {
  if (!value || typeof value !== "object") throw new Error(t("search.aiInvalidRequest"));
  const request = value as Record<string, unknown>;
  if (
    typeof request.sessionId !== "string"
    || request.sessionId.length < 8
    || request.sessionId.length > 128
    || !isSearchState(request.search)
    || !Array.isArray(request.excludeFilePaths)
    || !request.excludeFilePaths.every((filePath) => typeof filePath === "string")
  ) {
    throw new Error(t("search.aiInvalidRequestParameters"));
  }
  return {
    sessionId: request.sessionId,
    search: request.search,
    excludeFilePaths: request.excludeFilePaths.slice(0, 10_000)
  };
};

export const registerAiSearchIpc = ({
  registrar,
  isMainSenderAllowed,
  startSearch,
  cancelSearch
}: AiSearchIpcDependencies): void => {
  registerIpcDomain({
    registrar,
    isSenderAllowed: isMainSenderAllowed,
    registrations: [
      {
        kind: "handle",
        channel: "aiSearch:start",
        listener: (event, request: unknown) => startSearch(parseStartRequest(request), (update) => {
          if (!event.sender.isDestroyed()) event.sender.send("aiSearch:update", update);
        })
      },
      {
        kind: "handle",
        channel: "aiSearch:cancel",
        listener: (_event, sessionId: unknown, discard: unknown) => (
          typeof sessionId === "string" ? cancelSearch(sessionId, discard === true) : false
        )
      }
    ]
  });
};
