import path from "node:path";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type { IpcRegistrar } from "./ipcRegistration";
import { listDirectories } from "./directoryStore";
import { registerManualMetadataIpc } from "./manualMetadataIpc";
import type { TranslationKey, TranslationParameters } from "./localization";
import type { PreviewWindowData } from "./previewTypes";
import { updateManualKeywordsBatch, upsertFileManualKeywords } from "./sqliteImageIndex";

interface ManualMetadataRuntimeOptions {
  registrar: IpcRegistrar;
  isMainSenderAllowed: (event: IpcMainInvokeEvent) => boolean;
  getMainWindow: () => BrowserWindow | null;
  getPreviewWindow: () => BrowserWindow | null;
  getActivePreviewData: () => PreviewWindowData | null;
  setActivePreviewData: (data: PreviewWindowData) => void;
  translate: (key: TranslationKey, parameters?: TranslationParameters) => string;
}

const normalizePathKey = (filePath: string) => path.normalize(path.resolve(filePath)).toLowerCase();

export const registerManualMetadataRuntime = ({ registrar, isMainSenderAllowed, getMainWindow, getPreviewWindow, getActivePreviewData, setActivePreviewData, translate }: ManualMetadataRuntimeOptions) => {
  registerManualMetadataIpc({
    registrar,
    isSingleSenderAllowed: (event, filePath) => {
      if (isMainSenderAllowed(event)) return true;
      const previewWindow = getPreviewWindow();
      const activePreviewData = getActivePreviewData();
      return Boolean(
        previewWindow && !previewWindow.isDestroyed()
        && event.sender === previewWindow.webContents
        && activePreviewData && !activePreviewData.skimActive
        && normalizePathKey(filePath) === normalizePathKey(activePreviewData.filePath)
      );
    },
    isBatchSenderAllowed: isMainSenderAllowed,
    listDirectories,
    upsertFileKeywords: upsertFileManualKeywords,
    updateKeywordsBatch: updateManualKeywordsBatch,
    onSingleKeywordsUpdated: (event, filePath, keywords) => {
      const previewWindow = getPreviewWindow();
      const activePreviewData = getActivePreviewData();
      if (!previewWindow || previewWindow.isDestroyed() || event.sender !== previewWindow.webContents || !activePreviewData) return;
      const update = { sessionId: activePreviewData.sessionId, itemId: activePreviewData.itemId, filePath, manualKeywords: keywords };
      setActivePreviewData({ ...activePreviewData, manualKeywords: keywords });
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("preview:manualKeywordsUpdated", update);
    },
    translate
  });
};
