import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from "electron";
import type { DeleteFilesResult } from "./fileOperationService";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";

interface FileIpcLogger {
  debug(message: string, details: unknown): void;
  warn(message: string, details: unknown): void;
}

export interface FileIpcDependencies {
  registrar: IpcRegistrar;
  isPackaged: boolean;
  isClipboardSenderAllowed: (event: IpcMainInvokeEvent) => boolean;
  openPath: (filePath: string) => Promise<string>;
  showItemInFolder: (filePath: string) => void;
  normalizeClipboardPaths: (filePaths: unknown) => string[];
  writeClipboardText: (text: string) => void;
  copyFileItems: (filePaths: unknown) => Promise<number>;
  moveFilesToTrash: (filePaths: string[]) => Promise<DeleteFilesResult>;
  startFileDrag: (sender: WebContents, filePaths: unknown) => void;
  translateFileDeleteServiceFailure: () => string;
  translateFileDragStartFailure: () => string;
  logger?: FileIpcLogger;
}

const defaultLogger: FileIpcLogger = {
  debug: (message, details) => console.debug(message, details),
  warn: (message, details) => console.warn(message, details)
};

export const registerFileIpc = ({
  registrar,
  isPackaged,
  isClipboardSenderAllowed,
  openPath,
  showItemInFolder,
  normalizeClipboardPaths,
  writeClipboardText,
  copyFileItems,
  moveFilesToTrash,
  startFileDrag,
  translateFileDeleteServiceFailure,
  translateFileDragStartFailure,
  logger = defaultLogger
}: FileIpcDependencies): void => {
  registerIpcDomain({
    registrar,
    registrations: [
      {
        kind: "handle",
        channel: "file:open",
        listener: async (_event, filePath: string) => openPath(filePath)
      },
      {
        kind: "handle",
        channel: "file:showInFolder",
        listener: (_event, filePath: string) => {
          showItemInFolder(filePath);
        }
      },
      {
        kind: "handle",
        channel: "file:copyPaths",
        listener: (event, filePaths: unknown) => {
          if (!isClipboardSenderAllowed(event)) return 0;
          const paths = normalizeClipboardPaths(filePaths);
          if (paths.length > 0) writeClipboardText(paths.join("\r\n"));
          return paths.length;
        }
      },
      {
        kind: "handle",
        channel: "file:copyItems",
        listener: async (event, filePaths: unknown) => {
          if (!isClipboardSenderAllowed(event)) return 0;
          try {
            return await copyFileItems(filePaths);
          } catch (error) {
            logger.warn("[file-clipboard] failed to copy file items", {
              message: error instanceof Error ? error.message : String(error)
            });
            return 0;
          }
        }
      },
      {
        kind: "handle",
        channel: "file:moveToTrash",
        listener: async (_event, filePaths: unknown) => {
          const requestedPaths = Array.isArray(filePaths)
            ? filePaths.filter((filePath): filePath is string => typeof filePath === "string" && filePath.trim().length > 0)
            : [];
          if (!isPackaged) {
            logger.debug("[file-delete:ipc] request", { requestedPaths });
          }
          try {
            const result = await moveFilesToTrash(requestedPaths);
            if (!isPackaged) {
              logger.debug("[file-delete:ipc] result", result);
            }
            return result;
          } catch (error) {
            const message = error instanceof Error ? error.message : translateFileDeleteServiceFailure();
            logger.warn("[file-delete:ipc] failed before a result was produced", error);
            return {
              success: false,
              totalCount: requestedPaths.length,
              deletedPaths: [],
              failedItems: requestedPaths.map((filePath) => ({ path: filePath, error: message }))
            } satisfies DeleteFilesResult;
          }
        }
      },
      {
        kind: "on",
        channel: "file:startDrag",
        listener: (event: IpcMainEvent, filePaths: string[]) => {
          try {
            startFileDrag(event.sender, filePaths);
          } catch (error) {
            const message = error instanceof Error ? error.message : translateFileDragStartFailure();
            logger.warn("[file-drag] failed", { message });
          }
        }
      }
    ]
  });
};
