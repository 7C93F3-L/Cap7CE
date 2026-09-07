import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { PreviewContentSize, PreviewEmbeddedMetadata, PreviewItemActionRequest, PreviewManualKeywordsUpdate, PreviewNavigateDirection, PreviewWindowControlState, PreviewWindowData } from "./previewTypes";
import type { KeywordBatchUpdateRequest } from "./keywordTypes";
import type { AiSearchStartRequest, AiSearchStartResponse, AiSearchUpdate } from "./aiSearchService";

interface RuntimeDiagnosticsInfo {
  logDirectory: string;
  crashDirectory: string;
  runtimeLogPath: string;
  detailedLoggingEnabled: boolean;
}
type RuntimeDiagnosticsExportResult =
  | { status: "exported"; filePath: string }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

contextBridge.exposeInMainWorld("cap7ce", {
  window: {
    setShellState: (state: string, options?: { forceBounds?: boolean; preserveBounds?: boolean }) => ipcRenderer.invoke("window:setShellState", state, options),
    setAlwaysOnTop: (enabled: boolean) => ipcRenderer.invoke("window:setAlwaysOnTop", enabled),
    getAlwaysOnTop: () => ipcRenderer.invoke("window:getAlwaysOnTop"),
    toggleNormalMaximized: () => ipcRenderer.invoke("window:toggleNormalMaximized"),
    onShellStateChanged: (callback: (state: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: string) => callback(state);
      ipcRenderer.on("window:shellStateChanged", listener);
      return () => ipcRenderer.removeListener("window:shellStateChanged", listener);
    },
    onAlwaysOnTopChanged: (callback: (enabled: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, enabled: boolean) => callback(enabled);
      ipcRenderer.on("window:alwaysOnTopChanged", listener);
      return () => ipcRenderer.removeListener("window:alwaysOnTopChanged", listener);
    },
    onToggleSkimLocationPickerRequested: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("window:toggleSkimLocationPickerRequested", listener);
      return () => ipcRenderer.removeListener("window:toggleSkimLocationPickerRequested", listener);
    },
    onActivateSkimRequested: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("window:activateSkimRequested", listener);
      return () => ipcRenderer.removeListener("window:activateSkimRequested", listener);
    },
    onFocusMainSearch: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("window:focusMainSearch", listener);
      return () => ipcRenderer.removeListener("window:focusMainSearch", listener);
    },
    onRefreshCurrentPageRequested: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("window:refreshCurrentPageRequested", listener);
      return () => ipcRenderer.removeListener("window:refreshCurrentPageRequested", listener);
    },
    onActivateShellModeShortcut: (callback: (mode: "normal" | "standby") => void) => {
      const listener = (_event: Electron.IpcRendererEvent, mode: "normal" | "standby") => callback(mode);
      ipcRenderer.on("window:activateShellModeShortcut", listener);
      return () => ipcRenderer.removeListener("window:activateShellModeShortcut", listener);
    }
  },
  settingsWindow: {
    open: () => ipcRenderer.invoke("settingsWindow:open")
  },
  line: {
    activateMain: () => ipcRenderer.invoke("line:activateMain"),
    onPlacementChanged: (callback: (edge: "left" | "right" | "top" | "bottom") => void) => {
      const listener = (_event: Electron.IpcRendererEvent, edge: "left" | "right" | "top" | "bottom") => callback(edge);
      ipcRenderer.on("line:placementChanged", listener);
      return () => ipcRenderer.removeListener("line:placementChanged", listener);
    },
    onRefreshAppearance: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("line:refreshAppearance", listener);
      return () => ipcRenderer.removeListener("line:refreshAppearance", listener);
    }
  },
  app: {
    quit: () => ipcRenderer.invoke("app:quit"),
    openReleasePage: () => ipcRenderer.invoke("app:openReleasePage"),
    checkForUpdates: () => ipcRenderer.invoke("app:checkForUpdates"),
    downloadUpdate: () => ipcRenderer.invoke("app:downloadUpdate"),
    cancelUpdateDownload: () => ipcRenderer.invoke("app:cancelUpdateDownload"),
    onUpdateDownloadProgress: (callback: (progress: { receivedBytes: number; totalBytes: number | null; percent: number | null; completed?: boolean }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: { receivedBytes: number; totalBytes: number | null; percent: number | null; completed?: boolean }) => callback(progress);
      ipcRenderer.on("app:updateDownloadProgress", listener);
      return () => ipcRenderer.removeListener("app:updateDownloadProgress", listener);
    }
  },
  preview: {
    open: (data: PreviewWindowData) => ipcRenderer.invoke("preview:open", data),
    close: () => ipcRenderer.invoke("preview:close"),
    navigate: (direction: PreviewNavigateDirection) => ipcRenderer.send("preview:navigate", direction),
    requestItemAction: (request: PreviewItemActionRequest) => ipcRenderer.invoke("preview:itemAction", request),
    contentSize: (size: PreviewContentSize) => ipcRenderer.send("preview:contentSize", size),
    getWindowControlState: (): Promise<PreviewWindowControlState> => ipcRenderer.invoke("preview:getWindowControlState"),
    toggleMaximized: (): Promise<PreviewWindowControlState> => ipcRenderer.invoke("preview:toggleMaximized"),
    toggleAlwaysOnTop: (): Promise<PreviewWindowControlState> => ipcRenderer.invoke("preview:toggleAlwaysOnTop"),
    toggleSkimLocationPicker: () => ipcRenderer.invoke("preview:toggleSkimLocationPicker"),
    openSettings: () => ipcRenderer.invoke("preview:openSettings"),
    requestData: () => ipcRenderer.send("preview:data"),
    onData: (callback: (data: PreviewWindowData) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: PreviewWindowData) => callback(data);
      ipcRenderer.on("preview:data", listener);
      return () => ipcRenderer.removeListener("preview:data", listener);
    },
    onEmbeddedMetadata: (callback: (update: { sessionId: string; filePath: string; embeddedMetadata: PreviewEmbeddedMetadata }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, update: { sessionId: string; filePath: string; embeddedMetadata: PreviewEmbeddedMetadata }) => callback(update);
      ipcRenderer.on("preview:embeddedMetadata", listener);
      return () => ipcRenderer.removeListener("preview:embeddedMetadata", listener);
    },
    onReset: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("preview:reset", listener);
      return () => ipcRenderer.removeListener("preview:reset", listener);
    },
    onNavigate: (callback: (direction: PreviewNavigateDirection) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, direction: PreviewNavigateDirection) => callback(direction);
      ipcRenderer.on("preview:navigate", listener);
      return () => ipcRenderer.removeListener("preview:navigate", listener);
    },
    onClosed: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("preview:closed", listener);
      return () => ipcRenderer.removeListener("preview:closed", listener);
    },
    onItemAction: (callback: (request: PreviewItemActionRequest) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, request: PreviewItemActionRequest) => callback(request);
      ipcRenderer.on("preview:itemAction", listener);
      return () => ipcRenderer.removeListener("preview:itemAction", listener);
    },
    onManualKeywordsUpdated: (callback: (update: PreviewManualKeywordsUpdate) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, update: PreviewManualKeywordsUpdate) => callback(update);
      ipcRenderer.on("preview:manualKeywordsUpdated", listener);
      return () => ipcRenderer.removeListener("preview:manualKeywordsUpdated", listener);
    }
  },
  files: {
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    open: (filePath: string) => ipcRenderer.invoke("file:open", filePath),
    showInFolder: (filePath: string) => ipcRenderer.invoke("file:showInFolder", filePath),
    copyPaths: (filePaths: string[]) => ipcRenderer.invoke("file:copyPaths", filePaths),
    copyItems: (filePaths: string[]) => ipcRenderer.invoke("file:copyItems", filePaths),
    moveToTrash: (filePaths: string[]) => ipcRenderer.invoke("file:moveToTrash", filePaths),
    startDrag: (filePaths: string[]) => ipcRenderer.send("file:startDrag", filePaths)
  },
  directories: {
    list: () => ipcRenderer.invoke("directories:list"),
    selectAndAdd: () => ipcRenderer.invoke("directories:selectAndAdd"),
    addCandidates: (request: unknown) => ipcRenderer.invoke("directories:addCandidates", request),
    refreshFileCounts: (directoryIds: string[]) => ipcRenderer.invoke("directories:refreshFileCounts", directoryIds),
    updateName: (id: string, name: string) => ipcRenderer.invoke("directories:updateName", id, name),
    delete: (id: string) => ipcRenderer.invoke("directories:delete", id),
    onChanged: (callback: (directories: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, directories: unknown) => callback(directories);
      ipcRenderer.on("directories:changed", listener);
      return () => ipcRenderer.removeListener("directories:changed", listener);
    }
  },
  diagnostics: {
    getInfo: (): Promise<RuntimeDiagnosticsInfo> => ipcRenderer.invoke("diagnostics:getInfo"),
    setDetailedLogging: (enabled: boolean): Promise<RuntimeDiagnosticsInfo> => ipcRenderer.invoke("diagnostics:setDetailedLogging", enabled),
    export: (): Promise<RuntimeDiagnosticsExportResult> => ipcRenderer.invoke("diagnostics:export")
  },
  embeddedMetadata: {
    status: () => ipcRenderer.invoke("embeddedMetadata:status"),
    startBackfill: () => ipcRenderer.invoke("embeddedMetadata:startBackfill"),
    cancelBackfill: () => ipcRenderer.invoke("embeddedMetadata:cancelBackfill"),
    onStatusChanged: (callback: (status: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status);
      ipcRenderer.on("embeddedMetadata:statusChanged", listener);
      return () => ipcRenderer.removeListener("embeddedMetadata:statusChanged", listener);
    }
  },
  skim: {
    listLocations: () => ipcRenderer.invoke("skim:listLocations"),
    resolveDirectoryPath: (input: string) => ipcRenderer.invoke("skim:resolveDirectoryPath", input),
    read: (request: unknown) => ipcRenderer.invoke("skim:read", request),
    cancel: (taskId: string) => ipcRenderer.invoke("skim:cancel", taskId),
    beginVisualSession: (sessionId: string) => ipcRenderer.invoke("skim:beginVisualSession", sessionId),
    cancelVisualSession: (sessionId: string) => ipcRenderer.invoke("skim:cancelVisualSession", sessionId),
    inspect: (request: unknown) => ipcRenderer.invoke("skim:inspect", request),
    readTextPreview: (filePath: string) => ipcRenderer.invoke("skim:readTextPreview", filePath),
    startFolderStats: (request: unknown) => ipcRenderer.invoke("skim:startFolderStats", request),
    cancelFolderStats: (sessionId: string) => ipcRenderer.invoke("skim:cancelFolderStats", sessionId),
    readFileInfoDimensions: (filePath: string) => ipcRenderer.invoke("skim:readFileInfoDimensions", filePath),
    readFileInfoFolderStats: (request: unknown) => ipcRenderer.invoke("skim:readFileInfoFolderStats", request),
    cancelFileInfoFolderStats: (taskId: string) => ipcRenderer.invoke("skim:cancelFileInfoFolderStats", taskId),
    onFolderStats: (callback: (update: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, update: unknown) => callback(update);
      ipcRenderer.on("skim:folderStats", listener);
      return () => ipcRenderer.removeListener("skim:folderStats", listener);
    }
  },
  search: {
    images: (search: unknown, taskId: string) => ipcRenderer.invoke("search:images", search, taskId),
    cancel: (taskId: string) => ipcRenderer.invoke("search:cancel", taskId),
    refresh: (directoryIds?: string[]) => ipcRenderer.invoke("search:refresh", directoryIds),
    onIndexChanged: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("search:indexChanged", listener);
      return () => ipcRenderer.removeListener("search:indexChanged", listener);
    }
  },
  aiSearch: {
    start: (request: AiSearchStartRequest): Promise<AiSearchStartResponse> => ipcRenderer.invoke("aiSearch:start", request),
    cancel: (sessionId: string, discard = false): Promise<boolean> => ipcRenderer.invoke("aiSearch:cancel", sessionId, discard),
    onUpdate: (callback: (update: AiSearchUpdate) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, update: AiSearchUpdate) => callback(update);
      ipcRenderer.on("aiSearch:update", listener);
      return () => ipcRenderer.removeListener("aiSearch:update", listener);
    }
  },
  index: {
    updateManualKeywords: (filePath: string, keywordText: string): Promise<string[]> => (
      ipcRenderer.invoke("index:updateManualKeywords", filePath, keywordText)
    ),
    updateKeywordsBatch: (request: KeywordBatchUpdateRequest) => ipcRenderer.invoke("index:updateKeywordsBatch", request)
  },
  llamaRuntime: {
    settings: () => ipcRenderer.invoke("llamaRuntime:settings"),
    updateSelected: (selectedVersion: string) => ipcRenderer.invoke("llamaRuntime:updateSelected", selectedVersion),
    processState: () => ipcRenderer.invoke("llamaRuntime:processState"),
    start: () => ipcRenderer.invoke("llamaRuntime:start"),
    stop: () => ipcRenderer.invoke("llamaRuntime:stop"),
    onStatusChanged: (callback: (state: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
      ipcRenderer.on("llamaRuntime:statusChanged", listener);
      return () => ipcRenderer.removeListener("llamaRuntime:statusChanged", listener);
    }
  },
  ggufModels: {
    settings: () => ipcRenderer.invoke("ggufModels:settings"),
    updateSelected: (selectedModelId: string) => ipcRenderer.invoke("ggufModels:updateSelected", selectedModelId)
  },
  preferences: {
    get: () => ipcRenderer.invoke("preferences:get"),
    updateTheme: (themePreference: "system" | "light" | "dark") => ipcRenderer.invoke("preferences:updateTheme", themePreference),
    updateWindowMaterial: (material: "acrylic" | "mica") => ipcRenderer.invoke("preferences:updateWindowMaterial", material),
    updateUiFontSize: (size: 12 | 13 | 14 | 15 | 16) => ipcRenderer.invoke("preferences:updateUiFontSize", size),
    updateLanguage: (languagePreference: "system" | "zh-CN" | "en-US") => ipcRenderer.invoke("preferences:updateLanguage", languagePreference),
    updateSort: (sortPreference: { sortField: "file_name" | "modified_at"; sortDirection: "asc" | "desc" }) => ipcRenderer.invoke("preferences:updateSort", sortPreference),
    updateSkimSort: (skimSortPreference: { sortField: "file_name" | "modified_at"; sortDirection: "asc" | "desc" }) => ipcRenderer.invoke("preferences:updateSkimSort", skimSortPreference),
    updateAppearanceColors: (appearanceColors: { themeColor: string; accentColor: string }) => ipcRenderer.invoke("preferences:updateAppearanceColors", appearanceColors),
    updateEdgeCollapse: (enabled: boolean) => ipcRenderer.invoke("preferences:updateEdgeCollapse", enabled),
    updateStandbyLineVisible: (standbyLineVisible: boolean) => ipcRenderer.invoke("preferences:updateStandbyLineVisible", standbyLineVisible),
    updateLaunchAtLogin: (launchAtLogin: boolean) => ipcRenderer.invoke("preferences:updateLaunchAtLogin", launchAtLogin),
    updateSystemNotifications: (enabled: boolean) => ipcRenderer.invoke("preferences:updateSystemNotifications", enabled),
    updateAutoCacheOptimization: (enabled: boolean) => ipcRenderer.invoke("preferences:updateAutoCacheOptimization", enabled),
    updateAiRecognitionEnabled: (enabled: boolean) => ipcRenderer.invoke("preferences:updateAiRecognitionEnabled", enabled),
    updateQuickActionGlobalEnabled: (quickActionGlobalEnabled: boolean) => ipcRenderer.invoke("preferences:updateQuickActionGlobalEnabled", quickActionGlobalEnabled),
    updateCommandEnabled: (commandEnabled: boolean) => ipcRenderer.invoke("preferences:updateCommandEnabled", commandEnabled),
    updateSearchLabelVisibility: (searchLabelVisibility: { directory: boolean; sort: boolean; format: boolean; skimDisplay: boolean; ai: boolean }) => ipcRenderer.invoke("preferences:updateSearchLabelVisibility", searchLabelVisibility),
    updateSkimDisplay: (skimDisplay: { mode: "skim" | "all" | "custom"; searchMode: "skim" | "all" | "custom"; customExtensions: string[]; showHiddenFiles: boolean }) => ipcRenderer.invoke("preferences:updateSkimDisplay", skimDisplay),
    updateSkimSidebarFolders: (skimSidebarFolders: string[]) => ipcRenderer.invoke("preferences:updateSkimSidebarFolders", skimSidebarFolders),
    updateSkimSystemLocationsCollapsed: (collapsed: boolean) => ipcRenderer.invoke("preferences:updateSkimSystemLocationsCollapsed", collapsed),
    updateShortcutActions: (shortcutActions: {
      focusMainSearch: string;
      restoreDefaultWindow: string;
      hideToLine: string;
      toggleSkim: string;
      cycleDirectory: string;
      openSettings: string;
    }) => ipcRenderer.invoke("preferences:updateShortcutActions", shortcutActions),
    shortcutAvailability: () => ipcRenderer.invoke("preferences:shortcutAvailability"),
    beginShortcutCapture: () => ipcRenderer.invoke("preferences:beginShortcutCapture"),
    endShortcutCapture: () => ipcRenderer.invoke("preferences:endShortcutCapture"),
    onChanged: (callback: (preferences: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, preferences: unknown) => callback(preferences);
      ipcRenderer.on("preferences:changed", listener);
      return () => ipcRenderer.removeListener("preferences:changed", listener);
    },
    onStandbyLineVisibleChanged: (callback: (standbyLineVisible: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, standbyLineVisible: boolean) => callback(standbyLineVisible);
      ipcRenderer.on("preferences:standbyLineVisibleChanged", listener);
      return () => ipcRenderer.removeListener("preferences:standbyLineVisibleChanged", listener);
    },
    onEdgeCollapseEnabledChanged: (callback: (enabled: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, enabled: boolean) => callback(enabled);
      ipcRenderer.on("preferences:edgeCollapseEnabledChanged", listener);
      return () => ipcRenderer.removeListener("preferences:edgeCollapseEnabledChanged", listener);
    },
    onLanguageChanged: (callback: (languagePreference: "system" | "zh-CN" | "en-US", resolvedLanguage: "zh-CN" | "en-US") => void) => {
      const listener = (_event: Electron.IpcRendererEvent, languagePreference: "system" | "zh-CN" | "en-US", resolvedLanguage: "zh-CN" | "en-US") => callback(languagePreference, resolvedLanguage);
      ipcRenderer.on("preferences:languageChanged", listener);
      return () => ipcRenderer.removeListener("preferences:languageChanged", listener);
    }
  },
  cache: {
    stats: () => ipcRenderer.invoke("cache:stats"),
    optimizationStatus: () => ipcRenderer.invoke("cache:optimizationStatus"),
    setContentViewActive: (active: boolean) => ipcRenderer.invoke("cache:setContentViewActive", active),
    setGridInteractionActive: (active: boolean) => ipcRenderer.invoke("cache:setGridInteractionActive", active),
    discardQueuedInteractiveThumbnails: () => ipcRenderer.invoke("cache:discardQueuedInteractiveThumbnails"),
    onOptimizationStatusChanged: (callback: (status: { enabled: boolean; phase: "disabled" | "ready" | "discovering" | "running" | "completed"; queuedCount: number; processedCount: number; failedCount: number; activeDurationMs: number }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: { enabled: boolean; phase: "disabled" | "ready" | "discovering" | "running" | "completed"; queuedCount: number; processedCount: number; failedCount: number; activeDurationMs: number }) => callback(status);
      ipcRenderer.on("cache:optimizationStatusChanged", listener);
      return () => ipcRenderer.removeListener("cache:optimizationStatusChanged", listener);
    },
    authorizeClear: () => ipcRenderer.invoke("cache:authorizeClear"),
    clearAll: (token: string) => ipcRenderer.invoke("cache:clearAll", token),
    clearThumbnails: (token: string) => ipcRenderer.invoke("cache:clearThumbnails", token)
  },
  skimCache: {
    stats: () => ipcRenderer.invoke("skimCache:stats"),
    authorizeClear: () => ipcRenderer.invoke("skimCache:authorizeClear"),
    clear: (token: string) => ipcRenderer.invoke("skimCache:clear", token)
  }
});
