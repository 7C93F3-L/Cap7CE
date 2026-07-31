import { contextBridge, ipcRenderer } from "electron";
import type { PreviewContentSize, PreviewItemActionRequest, PreviewNavigateDirection, PreviewWindowControlState, PreviewWindowData } from "./previewTypes";
import type { KeywordBatchUpdateRequest } from "./keywordTypes";

contextBridge.exposeInMainWorld("imageEverything", {
  window: {
    setShellState: (state: string, options?: { forceBounds?: boolean; preserveBounds?: boolean }) => ipcRenderer.invoke("window:setShellState", state, options),
    setAlwaysOnTop: (enabled: boolean) => ipcRenderer.invoke("window:setAlwaysOnTop", enabled),
    getAlwaysOnTop: () => ipcRenderer.invoke("window:getAlwaysOnTop"),
    toggleNormalMaximized: () => ipcRenderer.invoke("window:toggleNormalMaximized"),
    getShellLayoutMetrics: () => ipcRenderer.invoke("window:getShellLayoutMetrics"),
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
    onOpenSettingsRequested: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("window:openSettingsRequested", listener);
      return () => ipcRenderer.removeListener("window:openSettingsRequested", listener);
    },
    onShowAllFilesRequested: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("window:showAllFilesRequested", listener);
      return () => ipcRenderer.removeListener("window:showAllFilesRequested", listener);
    },
    onActivateCapsuleShortcut: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("window:activateCapsuleShortcut", listener);
      return () => ipcRenderer.removeListener("window:activateCapsuleShortcut", listener);
    },
    onActivateShellModeShortcut: (callback: (mode: "micro" | "mini" | "normal" | "standby") => void) => {
      const listener = (_event: Electron.IpcRendererEvent, mode: "micro" | "mini" | "normal" | "standby") => callback(mode);
      ipcRenderer.on("window:activateShellModeShortcut", listener);
      return () => ipcRenderer.removeListener("window:activateShellModeShortcut", listener);
    }
  },
  app: {
    quit: () => ipcRenderer.invoke("app:quit"),
    openReleasePage: () => ipcRenderer.invoke("app:openReleasePage")
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
    openSettings: () => ipcRenderer.invoke("preview:openSettings"),
    requestData: () => ipcRenderer.send("preview:data"),
    onData: (callback: (data: PreviewWindowData) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: PreviewWindowData) => callback(data);
      ipcRenderer.on("preview:data", listener);
      return () => ipcRenderer.removeListener("preview:data", listener);
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
    }
  },
  files: {
    open: (filePath: string) => ipcRenderer.invoke("file:open", filePath),
    showInFolder: (filePath: string) => ipcRenderer.invoke("file:showInFolder", filePath),
    moveToTrash: (filePaths: string[]) => ipcRenderer.invoke("file:moveToTrash", filePaths),
    startDrag: (filePaths: string[]) => ipcRenderer.send("file:startDrag", filePaths)
  },
  directories: {
    list: () => ipcRenderer.invoke("directories:list"),
    selectAndAdd: () => ipcRenderer.invoke("directories:selectAndAdd"),
    addCandidates: (request: unknown) => ipcRenderer.invoke("directories:addCandidates", request),
    updateName: (id: string, name: string) => ipcRenderer.invoke("directories:updateName", id, name),
    delete: (id: string) => ipcRenderer.invoke("directories:delete", id)
  },
  skim: {
    read: (request: unknown) => ipcRenderer.invoke("skim:read", request),
    cancel: (taskId: string) => ipcRenderer.invoke("skim:cancel", taskId)
  },
  scan: {
    allDirectories: () => ipcRenderer.invoke("scan:allDirectories"),
    directory: (directoryId: string) => ipcRenderer.invoke("scan:directory", directoryId),
    onAiProgress: (callback: (progress: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress);
      ipcRenderer.on("ai:indexProgress", listener);
      return () => ipcRenderer.removeListener("ai:indexProgress", listener);
    }
  },
  search: {
    images: (search: unknown) => ipcRenderer.invoke("search:images", search)
  },
  index: {
    qualityStats: () => ipcRenderer.invoke("index:qualityStats"),
    updateManualMetadata: (filePath: string, caption: string, keywordText: string) => (
      ipcRenderer.invoke("index:updateManualMetadata", filePath, caption, keywordText)
    ),
    updateKeywordsBatch: (request: KeywordBatchUpdateRequest) => ipcRenderer.invoke("index:updateKeywordsBatch", request),
    continueRecognition: () => ipcRenderer.invoke("index:continueRecognition"),
    cancelRecognition: () => ipcRenderer.invoke("index:cancelRecognition")
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
    updateLanguage: (languagePreference: "system" | "zh-CN" | "en-US") => ipcRenderer.invoke("preferences:updateLanguage", languagePreference),
    updateSort: (sortPreference: { sortField: "file_name" | "modified_at"; sortDirection: "asc" | "desc" }) => ipcRenderer.invoke("preferences:updateSort", sortPreference),
    updateAppearanceColors: (appearanceColors: { themeColor: string; accentColor: string }) => ipcRenderer.invoke("preferences:updateAppearanceColors", appearanceColors),
    updateEdgeSnap: (edgeSnapEnabled: boolean) => ipcRenderer.invoke("preferences:updateEdgeSnap", edgeSnapEnabled),
    updateStandbyLineVisible: (standbyLineVisible: boolean) => ipcRenderer.invoke("preferences:updateStandbyLineVisible", standbyLineVisible),
    updateLaunchAtLogin: (launchAtLogin: boolean) => ipcRenderer.invoke("preferences:updateLaunchAtLogin", launchAtLogin),
    updateOperationHints: (enabled: boolean) => ipcRenderer.invoke("preferences:updateOperationHints", enabled),
    updateAutoCacheOptimization: (enabled: boolean) => ipcRenderer.invoke("preferences:updateAutoCacheOptimization", enabled),
    updateQuickActionGlobalEnabled: (quickActionGlobalEnabled: boolean) => ipcRenderer.invoke("preferences:updateQuickActionGlobalEnabled", quickActionGlobalEnabled),
    updateCommandEnabled: (commandEnabled: boolean) => ipcRenderer.invoke("preferences:updateCommandEnabled", commandEnabled),
    updateSearchLabelVisibility: (searchLabelVisibility: { directory: boolean; recognition: boolean; sort: boolean; format: boolean }) => ipcRenderer.invoke("preferences:updateSearchLabelVisibility", searchLabelVisibility),
    updateShortcutActions: (shortcutActions: {
      activateCapsule: string;
      activateMicro: string;
      activateMini: string;
      activateNormal: string;
      activateStandby: string;
      openSettings: string;
    }) => ipcRenderer.invoke("preferences:updateShortcutActions", shortcutActions),
    shortcutAvailability: () => ipcRenderer.invoke("preferences:shortcutAvailability"),
    beginShortcutCapture: () => ipcRenderer.invoke("preferences:beginShortcutCapture"),
    endShortcutCapture: () => ipcRenderer.invoke("preferences:endShortcutCapture"),
    onStandbyLineVisibleChanged: (callback: (standbyLineVisible: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, standbyLineVisible: boolean) => callback(standbyLineVisible);
      ipcRenderer.on("preferences:standbyLineVisibleChanged", listener);
      return () => ipcRenderer.removeListener("preferences:standbyLineVisibleChanged", listener);
    },
    onEdgeSnapEnabledChanged: (callback: (edgeSnapEnabled: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, edgeSnapEnabled: boolean) => callback(edgeSnapEnabled);
      ipcRenderer.on("preferences:edgeSnapEnabledChanged", listener);
      return () => ipcRenderer.removeListener("preferences:edgeSnapEnabledChanged", listener);
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
    onOptimizationStatusChanged: (callback: (status: { enabled: boolean; phase: "disabled" | "ready" | "running" | "completed"; queuedCount: number; processedCount: number; failedCount: number }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: { enabled: boolean; phase: "disabled" | "ready" | "running" | "completed"; queuedCount: number; processedCount: number; failedCount: number }) => callback(status);
      ipcRenderer.on("cache:optimizationStatusChanged", listener);
      return () => ipcRenderer.removeListener("cache:optimizationStatusChanged", listener);
    },
    authorizeClear: () => ipcRenderer.invoke("cache:authorizeClear"),
    clearAll: (token: string) => ipcRenderer.invoke("cache:clearAll", token)
  }
});
