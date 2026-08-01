/// <reference types="vite/client" />

import type { AiIndexProgress, AiIndexRunResponse, DeleteFilesResult, DirectoryAddRequest, DirectoryAddResult, DirectoryItem, GgufModelSettings, ImageIndexItem, ImageScanResponse, ImageSearchResponse, IndexQualityStats, KeywordBatchUpdateRequest, KeywordBatchUpdateResult, LlamaRuntimeProcessState, LlamaRuntimeSettings, PreviewContentSize, PreviewItemActionRequest, PreviewNavigateDirection, PreviewWindowControlState, PreviewWindowData, SearchState, ShortcutActionsUpdateResult, ShortcutAvailabilityResult, SkimFolderStatsUpdate, SkimPreviewInfo, SkimReadRequest, SkimReadResponse, SkimTextPreview, ThumbnailOptimizationStatus, UserPreferences, VisualCacheStats } from "../shared/types";

type Cap7CEShellState = "standby" | "capsule" | "micro" | "mini" | "normal" | "settings";
type Cap7CEWindowBounds = { x: number; y: number; width: number; height: number };
type Cap7CEAlwaysOnTopState = { enabled: boolean; actual: boolean; windowId: number | null };

declare global {
  interface Window {
    imageEverything?: {
      window: {
        setShellState: (state: Cap7CEShellState, options?: { forceBounds?: boolean; preserveBounds?: boolean }) => Promise<boolean>;
        setAlwaysOnTop: (enabled: boolean) => Promise<Cap7CEAlwaysOnTopState>;
        getAlwaysOnTop: () => Promise<Cap7CEAlwaysOnTopState>;
        toggleNormalMaximized: () => Promise<{ isMaximized: boolean; lastNormalBounds: Cap7CEWindowBounds | null }>;
        getShellLayoutMetrics: () => Promise<{ miniStandardHeight: number }>;
        onShellStateChanged: (callback: (state: Cap7CEShellState) => void) => () => void;
        onAlwaysOnTopChanged: (callback: (enabled: boolean) => void) => () => void;
        onOpenSettingsRequested: (callback: () => void) => () => void;
        onToggleSkimRequested: (callback: () => void) => () => void;
        onActivateSkimRequested: (callback: () => void) => () => void;
        onShowAllFilesRequested: (callback: () => void) => () => void;
        onActivateCapsuleShortcut: (callback: () => void) => () => void;
        onActivateShellModeShortcut: (callback: (mode: "micro" | "mini" | "normal" | "standby") => void) => () => void;
      };
      app: {
        quit: () => Promise<boolean>;
        openReleasePage: () => Promise<boolean>;
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
        toggleSkim: () => Promise<boolean>;
        openSettings: () => Promise<boolean>;
        requestData: () => void;
        onData: (callback: (data: PreviewWindowData) => void) => () => void;
        onNavigate: (callback: (direction: PreviewNavigateDirection) => void) => () => void;
        onClosed: (callback: () => void) => () => void;
        onItemAction: (callback: (request: PreviewItemActionRequest) => void) => () => void;
      };
      files: {
        getPathForFile: (file: File) => string;
        open: (filePath: string) => Promise<string>;
        showInFolder: (filePath: string) => Promise<void>;
        moveToTrash: (filePaths: string[]) => Promise<DeleteFilesResult>;
        startDrag: (filePaths: string[]) => void;
      };
      directories: {
        list: () => Promise<DirectoryItem[]>;
        selectAndAdd: () => Promise<DirectoryAddResult>;
        addCandidates: (request: DirectoryAddRequest) => Promise<DirectoryAddResult>;
        updateName: (id: string, name: string) => Promise<DirectoryItem[]>;
        delete: (id: string) => Promise<DirectoryItem[]>;
      };
      skim: {
        read: (request: SkimReadRequest) => Promise<SkimReadResponse>;
        cancel: (taskId: string) => Promise<boolean>;
        beginVisualSession: (sessionId: string) => Promise<boolean>;
        cancelVisualSession: (sessionId: string) => Promise<boolean>;
        inspect: (request: { path: string; kind: "file" | "folder" }) => Promise<SkimPreviewInfo>;
        readTextPreview: (filePath: string) => Promise<SkimTextPreview>;
        startFolderStats: (request: { sessionId: string; path: string }) => Promise<boolean>;
        cancelFolderStats: (sessionId: string) => Promise<boolean>;
        onFolderStats: (callback: (update: SkimFolderStatsUpdate) => void) => () => void;
      };
      scan: {
        allDirectories: () => Promise<ImageScanResponse>;
        directory: (directoryId: string) => Promise<ImageScanResponse>;
        onAiProgress: (callback: (progress: AiIndexProgress) => void) => () => void;
      };
      search: {
        images: (search: SearchState) => Promise<ImageSearchResponse>;
      };
      index: {
        qualityStats: () => Promise<IndexQualityStats>;
        updateManualMetadata: (filePath: string, caption: string, keywordText: string) => Promise<boolean>;
        updateKeywordsBatch: (request: KeywordBatchUpdateRequest) => Promise<KeywordBatchUpdateResult>;
        continueRecognition: () => Promise<AiIndexRunResponse>;
        cancelRecognition: () => Promise<boolean>;
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
        updateAppearanceColors: (appearanceColors: UserPreferences["appearanceColors"]) => Promise<UserPreferences>;
        updateEdgeSnap: (edgeSnapEnabled: UserPreferences["edgeSnapEnabled"]) => Promise<UserPreferences>;
        updateStandbyLineVisible: (standbyLineVisible: UserPreferences["standbyLineVisible"]) => Promise<UserPreferences>;
        updateLaunchAtLogin: (launchAtLogin: UserPreferences["launchAtLogin"]) => Promise<UserPreferences>;
        updateOperationHints: (enabled: UserPreferences["operationHintsEnabled"]) => Promise<UserPreferences>;
        updateAutoCacheOptimization: (enabled: UserPreferences["autoCacheOptimizationEnabled"]) => Promise<UserPreferences>;
        updateQuickActionGlobalEnabled: (quickActionGlobalEnabled: UserPreferences["quickActionGlobalEnabled"]) => Promise<UserPreferences>;
        updateCommandEnabled: (commandEnabled: UserPreferences["commandEnabled"]) => Promise<UserPreferences>;
        updateSearchLabelVisibility: (searchLabelVisibility: UserPreferences["searchLabelVisibility"]) => Promise<UserPreferences>;
        updateShortcutActions: (shortcutActions: UserPreferences["shortcutActions"]) => Promise<ShortcutActionsUpdateResult>;
        shortcutAvailability: () => Promise<ShortcutAvailabilityResult>;
        beginShortcutCapture: () => Promise<boolean>;
        endShortcutCapture: () => Promise<ShortcutAvailabilityResult>;
        onStandbyLineVisibleChanged: (callback: (standbyLineVisible: UserPreferences["standbyLineVisible"]) => void) => () => void;
        onEdgeSnapEnabledChanged: (callback: (edgeSnapEnabled: UserPreferences["edgeSnapEnabled"]) => void) => () => void;
        onLanguageChanged: (callback: (languagePreference: UserPreferences["languagePreference"], resolvedLanguage: "zh-CN" | "en-US") => void) => () => void;
      };
      cache: {
        stats: () => Promise<VisualCacheStats>;
        optimizationStatus: () => Promise<ThumbnailOptimizationStatus>;
        onOptimizationStatusChanged: (callback: (status: ThumbnailOptimizationStatus) => void) => () => void;
        authorizeClear: () => Promise<string>;
        clearAll: (token: string) => Promise<VisualCacheStats>;
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
