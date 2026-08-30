/// <reference types="vite/client" />

import type { AiSearchStartRequest, AiSearchStartResponse, AiSearchUpdate, DeleteFilesResult, DirectoryAddRequest, DirectoryAddResult, DirectoryItem, EmbeddedMetadataTaskStatus, GgufModelSettings, ImageIndexItem, ImageSearchResponse, KeywordBatchUpdateRequest, KeywordBatchUpdateResult, LlamaRuntimeProcessState, LlamaRuntimeSettings, PreviewContentSize, PreviewEmbeddedMetadata, PreviewItemActionRequest, PreviewNavigateDirection, PreviewWindowControlState, PreviewWindowData, RuntimeDiagnosticsExportResult, RuntimeDiagnosticsInfo, SearchState, ShortcutActionsUpdateResult, ShortcutAvailabilityResult, SkimFolderStats, SkimFolderStatsUpdate, SkimPreviewInfo, SkimReadRequest, SkimReadResponse, SkimTextPreview, ThumbnailOptimizationStatus, UserPreferences, VisualCacheStats } from "../shared/types";

type Cap7CEShellState = "standby" | "capsule" | "micro" | "mini" | "normal" | "settings";
type Cap7CEWindowBounds = { x: number; y: number; width: number; height: number };
type Cap7CEAlwaysOnTopState = { enabled: boolean; actual: boolean; windowId: number | null };

declare global {
  interface Window {
    cap7ce?: {
      window: {
        setShellState: (state: Cap7CEShellState, options?: { forceBounds?: boolean; preserveBounds?: boolean }) => Promise<boolean>;
        revealAfterShellStateReady: () => Promise<boolean>;
        setAlwaysOnTop: (enabled: boolean) => Promise<Cap7CEAlwaysOnTopState>;
        getAlwaysOnTop: () => Promise<Cap7CEAlwaysOnTopState>;
        toggleNormalMaximized: () => Promise<{ isMaximized: boolean; lastNormalBounds: Cap7CEWindowBounds | null }>;
        getShellLayoutMetrics: () => Promise<{ miniStandardHeight: number; titlebarHeight: number; windowPresentationMode: UserPreferences["windowPresentationMode"] }>;
        onShellStateChanged: (callback: (state: Cap7CEShellState) => void) => () => void;
        onAlwaysOnTopChanged: (callback: (enabled: boolean) => void) => () => void;
        onOpenSettingsRequested: (callback: () => void) => () => void;
        onToggleSkimLocationPickerRequested: (callback: () => void) => () => void;
        onActivateSkimRequested: (callback: () => void) => () => void;
        onActivateCapsuleShortcut: (callback: () => void) => () => void;
        onActivateShellModeShortcut: (callback: (mode: "capsule" | "micro" | "mini" | "normal" | "standby") => void) => () => void;
      };
      line: {
        activateCapsule: () => Promise<boolean>;
        onPlacementChanged: (callback: (edge: "left" | "right" | "top" | "bottom") => void) => () => void;
        onRefreshAppearance: (callback: () => void) => () => void;
      };
      app: {
        quit: () => Promise<boolean>;
        openReleasePage: () => Promise<boolean>;
        checkForUpdates: () => Promise<{
          status: "up_to_date" | "update_available" | "failed";
          currentVersion: string;
          latestVersion?: string;
        }>;
        downloadUpdate: () => Promise<{
          status: "installing" | "unsupported" | "busy" | "cancelled" | "failed";
          version?: string;
          reason?: "cancelled" | "rate_limited" | "network" | "disk_space" | "security" | "incomplete" | "invalid" | "unknown";
        }>;
        cancelUpdateDownload: () => Promise<boolean>;
        onUpdateDownloadProgress: (callback: (progress: {
          receivedBytes: number;
          totalBytes: number | null;
          percent: number | null;
          completed?: boolean;
        }) => void) => () => void;
      };
      preview: {
        open: (data: PreviewWindowData) => Promise<boolean>;
        close: () => Promise<boolean>;
        navigate: (direction: PreviewNavigateDirection) => void;
        requestItemAction: (request: PreviewItemActionRequest) => Promise<boolean>;
        contentSize: (size: PreviewContentSize) => void;
        getWindowControlState: () => Promise<PreviewWindowControlState>;
        toggleMaximized: () => Promise<PreviewWindowControlState>;
        toggleAlwaysOnTop: () => Promise<PreviewWindowControlState>;
        toggleSkimLocationPicker: () => Promise<boolean>;
        openSettings: () => Promise<boolean>;
        requestData: () => void;
        onData: (callback: (data: PreviewWindowData) => void) => () => void;
        onEmbeddedMetadata: (callback: (update: { sessionId: string; filePath: string; embeddedMetadata: PreviewEmbeddedMetadata }) => void) => () => void;
        onReset: (callback: () => void) => () => void;
        onNavigate: (callback: (direction: PreviewNavigateDirection) => void) => () => void;
        onClosed: (callback: () => void) => () => void;
        onItemAction: (callback: (request: PreviewItemActionRequest) => void) => () => void;
      };
      files: {
        getPathForFile: (file: File) => string;
        open: (filePath: string) => Promise<string>;
        showInFolder: (filePath: string) => Promise<void>;
        copyPaths: (filePaths: string[]) => Promise<number>;
        copyItems: (filePaths: string[]) => Promise<number>;
        moveToTrash: (filePaths: string[]) => Promise<DeleteFilesResult>;
        startDrag: (filePaths: string[]) => void;
      };
      directories: {
        list: () => Promise<DirectoryItem[]>;
        selectAndAdd: () => Promise<DirectoryAddResult>;
        addCandidates: (request: DirectoryAddRequest) => Promise<DirectoryAddResult>;
        refreshFileCounts: (directoryIds: string[]) => Promise<DirectoryItem[]>;
        updateName: (id: string, name: string) => Promise<DirectoryItem[]>;
        delete: (id: string) => Promise<DirectoryItem[]>;
      };
      diagnostics: {
        getInfo: () => Promise<RuntimeDiagnosticsInfo>;
        setDetailedLogging: (enabled: boolean) => Promise<RuntimeDiagnosticsInfo>;
        export: () => Promise<RuntimeDiagnosticsExportResult>;
      };
      embeddedMetadata: {
        status: () => Promise<EmbeddedMetadataTaskStatus>;
        startBackfill: () => Promise<EmbeddedMetadataTaskStatus>;
        cancelBackfill: () => Promise<boolean>;
        onStatusChanged: (callback: (status: EmbeddedMetadataTaskStatus) => void) => () => void;
      };
      skim: {
        listLocations: () => Promise<SkimLocationShortcut[]>;
        resolveDirectoryPath: (input: string) => Promise<string | null>;
        read: (request: SkimReadRequest) => Promise<SkimReadResponse>;
        cancel: (taskId: string) => Promise<boolean>;
        beginVisualSession: (sessionId: string) => Promise<boolean>;
        cancelVisualSession: (sessionId: string) => Promise<boolean>;
        inspect: (request: { path: string; kind: "file" | "folder" }) => Promise<SkimPreviewInfo>;
        readTextPreview: (filePath: string) => Promise<SkimTextPreview>;
        startFolderStats: (request: { sessionId: string; path: string }) => Promise<boolean>;
        cancelFolderStats: (sessionId: string) => Promise<boolean>;
        readFileInfoDimensions: (filePath: string) => Promise<{ width: number; height: number } | null>;
        readFileInfoFolderStats: (request: { taskId: string; path: string }) => Promise<SkimFolderStats | null>;
        cancelFileInfoFolderStats: (taskId: string) => Promise<boolean>;
        onFolderStats: (callback: (update: SkimFolderStatsUpdate) => void) => () => void;
      };
      search: {
        images: (search: SearchState, taskId: string) => Promise<ImageSearchResponse>;
        cancel: (taskId: string) => Promise<boolean>;
        refresh: (directoryIds?: string[]) => Promise<boolean>;
        onIndexChanged: (callback: () => void) => () => void;
      };
      aiSearch: {
        start: (request: AiSearchStartRequest) => Promise<AiSearchStartResponse>;
        cancel: (sessionId: string, discard?: boolean) => Promise<boolean>;
        onUpdate: (callback: (update: AiSearchUpdate) => void) => () => void;
      };
      index: {
        updateManualKeywords: (filePath: string, keywordText: string) => Promise<boolean>;
        updateKeywordsBatch: (request: KeywordBatchUpdateRequest) => Promise<KeywordBatchUpdateResult>;
      };
      llamaRuntime: {
        settings: () => Promise<LlamaRuntimeSettings>;
        updateSelected: (selectedVersion: string) => Promise<LlamaRuntimeSettings>;
        processState: () => Promise<LlamaRuntimeProcessState>;
        start: () => Promise<LlamaRuntimeProcessState>;
        stop: () => Promise<LlamaRuntimeProcessState>;
        onStatusChanged: (callback: (state: LlamaRuntimeProcessState) => void) => () => void;
      };
      ggufModels: {
        settings: () => Promise<GgufModelSettings>;
        updateSelected: (selectedModelId: string) => Promise<GgufModelSettings>;
      };
      preferences: {
        get: () => Promise<UserPreferences>;
        updateTheme: (themePreference: UserPreferences["themePreference"]) => Promise<UserPreferences>;
        updateLanguage: (languagePreference: UserPreferences["languagePreference"]) => Promise<UserPreferences>;
        updateSort: (sortPreference: UserPreferences["sortPreference"]) => Promise<UserPreferences>;
        updateSkimSort: (skimSortPreference: UserPreferences["skimSortPreference"]) => Promise<UserPreferences>;
        updateAppearanceColors: (appearanceColors: UserPreferences["appearanceColors"]) => Promise<UserPreferences>;
        updateEdgeCollapse: (enabled: UserPreferences["edgeCollapseEnabled"]) => Promise<UserPreferences>;
        updateRememberWindowLayout: (enabled: UserPreferences["rememberWindowLayout"]) => Promise<UserPreferences>;
        updateWindowPresentationMode: (mode: UserPreferences["windowPresentationMode"]) => Promise<UserPreferences>;
        updateStandbyLineVisible: (standbyLineVisible: UserPreferences["standbyLineVisible"]) => Promise<UserPreferences>;
        updateLaunchAtLogin: (launchAtLogin: UserPreferences["launchAtLogin"]) => Promise<UserPreferences>;
        updateSystemNotifications: (enabled: UserPreferences["systemNotificationsEnabled"]) => Promise<UserPreferences>;
        updateOperationHints: (enabled: UserPreferences["operationHintsEnabled"]) => Promise<UserPreferences>;
        updateAutoCacheOptimization: (enabled: UserPreferences["autoCacheOptimizationEnabled"]) => Promise<UserPreferences>;
        updateAiRecognitionEnabled: (enabled: UserPreferences["aiRecognitionEnabled"]) => Promise<UserPreferences>;
        updateQuickActionGlobalEnabled: (quickActionGlobalEnabled: UserPreferences["quickActionGlobalEnabled"]) => Promise<UserPreferences>;
        updateCommandEnabled: (commandEnabled: UserPreferences["commandEnabled"]) => Promise<UserPreferences>;
        updateSearchLabelVisibility: (searchLabelVisibility: UserPreferences["searchLabelVisibility"]) => Promise<UserPreferences>;
        updateSkimDisplay: (skimDisplay: UserPreferences["skimDisplay"]) => Promise<UserPreferences>;
        updateSkimSidebarFolders: (skimSidebarFolders: UserPreferences["skimSidebarFolders"]) => Promise<UserPreferences>;
        updateSkimSystemLocationsCollapsed: (collapsed: boolean) => Promise<UserPreferences>;
        updateShortcutActions: (shortcutActions: UserPreferences["shortcutActions"]) => Promise<ShortcutActionsUpdateResult>;
        shortcutAvailability: () => Promise<ShortcutAvailabilityResult>;
        beginShortcutCapture: () => Promise<boolean>;
        endShortcutCapture: () => Promise<ShortcutAvailabilityResult>;
        onStandbyLineVisibleChanged: (callback: (standbyLineVisible: UserPreferences["standbyLineVisible"]) => void) => () => void;
        onEdgeCollapseEnabledChanged: (callback: (enabled: UserPreferences["edgeCollapseEnabled"]) => void) => () => void;
        onLanguageChanged: (callback: (languagePreference: UserPreferences["languagePreference"], resolvedLanguage: "zh-CN" | "en-US") => void) => () => void;
      };
      cache: {
        stats: () => Promise<VisualCacheStats>;
        optimizationStatus: () => Promise<ThumbnailOptimizationStatus>;
        setContentViewActive: (active: boolean) => Promise<boolean>;
        setGridInteractionActive: (active: boolean) => Promise<boolean>;
        discardQueuedInteractiveThumbnails: () => Promise<number>;
        onOptimizationStatusChanged: (callback: (status: ThumbnailOptimizationStatus) => void) => () => void;
        authorizeClear: () => Promise<string>;
        clearAll: (token: string) => Promise<VisualCacheStats>;
        clearThumbnails: (token: string) => Promise<VisualCacheStats>;
      };
      skimCache: {
        stats: () => Promise<VisualCacheStats>;
        authorizeClear: () => Promise<string>;
        clear: (token: string) => Promise<VisualCacheStats>;
      };
    };
  }
}

export {};
