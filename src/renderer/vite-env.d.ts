/// <reference types="vite/client" />

import type { DeleteFilesResult, DirectoryAddRequest, DirectoryAddResult, DirectoryItem, GgufModelSettings, ImageIndexItem, ImageSearchResponse, KeywordBatchUpdateRequest, KeywordBatchUpdateResult, LlamaRuntimeProcessState, LlamaRuntimeSettings, PreviewContentSize, PreviewEmbeddedMetadata, PreviewItemActionRequest, PreviewManualKeywordsUpdate, PreviewNavigateDirection, PreviewWindowControlState, PreviewWindowData, RuntimeDiagnosticsExportResult, RuntimeDiagnosticsInfo, SearchState, ShortcutActionsUpdateResult, ShortcutAvailabilityResult, SkimFolderStats, SkimFolderStatsUpdate, SkimPreviewInfo, SkimReadRequest, SkimReadResponse, SkimTextPreview, ThumbnailOptimizationStatus, UserPreferences, VisualCacheStats } from "../shared/types";
import type { AppUpdateActionResponse, AppUpdateCheckResponse, AppUpdateDownloadProgress, AppUpdatePublicState } from "../../electron/appUpdateTypes";
import type { ComputerSearchAuthorization, ComputerSearchAuthorizationBatch, ComputerSearchCapabilityOptions, ComputerSearchCapabilityRequest, ComputerSearchCapabilityResult, ComputerSearchNextPageRequest, ComputerSearchPage, ComputerSearchRequest, ComputerSearchStatus } from "../../electron/computerSearchTypes";
import type { MetadataBuildApi } from "../shared/metadataBuildTypes";
import type { SettingsWindowApi } from "../shared/settingsWindowTypes";
import type { MainWindowStateOptions } from "../shared/mainWindowStateTypes";

type Cap7CEShellState = "standby" | "normal";
type Cap7CEWindowBounds = { x: number; y: number; width: number; height: number };
type Cap7CEAlwaysOnTopState = { enabled: boolean; actual: boolean; windowId: number | null };

declare global {
  interface Window {
    cap7ce?: {
      metadataBuild: MetadataBuildApi;
      window: {
        setShellState: (state: Cap7CEShellState, options?: MainWindowStateOptions) => Promise<boolean>;
        setAlwaysOnTop: (enabled: boolean) => Promise<Cap7CEAlwaysOnTopState>;
        getAlwaysOnTop: () => Promise<Cap7CEAlwaysOnTopState>;
        toggleNormalMaximized: () => Promise<{ isMaximized: boolean; lastNormalBounds: Cap7CEWindowBounds | null }>;
        onShellStateChanged: (callback: (state: Cap7CEShellState) => void) => () => void;
        onAlwaysOnTopChanged: (callback: (enabled: boolean) => void) => () => void;
        onToggleSkimLocationPickerRequested: (callback: () => void) => () => void;
        onFocusMainSearch: (callback: () => void) => () => void;
        onRefreshCurrentPageRequested: (callback: () => void) => () => void;
        onActivateShellModeShortcut: (callback: (mode: "normal" | "standby") => void) => () => void;
      };
      settingsWindow: SettingsWindowApi;
      line: {
        activateMain: () => Promise<boolean>;
        onVisibilityChanged: (callback: (visible: boolean) => void) => () => void;
        onPlacementChanged: (callback: (edge: "left" | "right" | "top" | "bottom") => void) => () => void;
        onRefreshAppearance: (callback: () => void) => () => void;
      };
      app: {
        quit: () => Promise<boolean>;
        openReleasePage: () => Promise<boolean>;
        getUpdateState: () => Promise<AppUpdatePublicState>;
        checkForUpdates: () => Promise<AppUpdateCheckResponse>;
        downloadUpdate: () => Promise<AppUpdateActionResponse>;
        pauseUpdateDownload: () => Promise<boolean>;
        discardUpdate: () => Promise<boolean>;
        installUpdate: () => Promise<AppUpdateActionResponse>;
        onUpdateDownloadProgress: (callback: (progress: AppUpdateDownloadProgress) => void) => () => void;
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
        onManualKeywordsUpdated: (callback: (update: PreviewManualKeywordsUpdate) => void) => () => void;
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
        move: (id: string, direction: "up" | "down") => Promise<DirectoryItem[]>;
        delete: (id: string) => Promise<DirectoryItem[]>;
        onChanged: (callback: (directories: DirectoryItem[]) => void) => () => void;
      };
      diagnostics: {
        getInfo: () => Promise<RuntimeDiagnosticsInfo>;
        setDetailedLogging: (enabled: boolean) => Promise<RuntimeDiagnosticsInfo>;
        export: () => Promise<RuntimeDiagnosticsExportResult>;
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
      favoriteDirectories: import("../shared/favoriteDirectoryTypes").FavoriteDirectoryApi;
      computerSearch: {
        moveToTrash: (request: import("../../electron/computerSearchTypes").ComputerSearchAuthorizationBatch) => Promise<DeleteFilesResult>;
        onCatalogChanged: (callback: (revision: number) => void) => () => void;
        status: () => Promise<ComputerSearchStatus>;
        capabilityOptions: () => Promise<ComputerSearchCapabilityOptions>;
        configureCapability: (request: ComputerSearchCapabilityRequest) => Promise<ComputerSearchCapabilityResult>;
        search: (request: ComputerSearchRequest) => Promise<ComputerSearchPage>;
        nextPage: (request: ComputerSearchNextPageRequest) => Promise<ComputerSearchPage>;
        cancel: (taskId: string) => Promise<boolean>;
        acquireThumbnail: (request: ComputerSearchAuthorization) => Promise<string | null>;
        releaseThumbnail: (request: { taskId: string; leaseId: string }) => Promise<boolean>;
        open: (request: ComputerSearchAuthorization) => Promise<string>;
        showInFolder: (request: ComputerSearchAuthorization) => Promise<boolean>;
        copyPaths: (request: ComputerSearchAuthorizationBatch) => Promise<number>;
        inspect: (request: ComputerSearchAuthorization) => Promise<SkimPreviewInfo>;
        readFileDetails: (request: import("../shared/fileInformationTypes").CatalogFileDetailsRequest) => Promise<import("../shared/fileInformationTypes").CatalogFileDetails | null>;
        readKeywords: (request: import("../../electron/computerSearchTypes").ComputerSearchAuthorization) => Promise<import("../shared/catalogKeywordTypes").CatalogKeywordSnapshot>;
        saveKeywords: (request: import("../shared/catalogKeywordTypes").CatalogKeywordSaveRequest) => Promise<import("../shared/catalogKeywordTypes").CatalogKeywordSaveResult>;
        generateKeywords: (request: import("../shared/catalogAutoKeywordTypes").CatalogAutoKeywordRequest) => Promise<import("../shared/catalogAutoKeywordTypes").CatalogAutoKeywordResult>;
        generateKeywordBatch: (request: import("../shared/catalogKeywordBatchTypes").CatalogKeywordBatchRequest) => Promise<import("../shared/catalogKeywordBatchTypes").CatalogKeywordBatchResult>;
        onKeywordBatchProgress: (callback: (progress: import("../shared/catalogKeywordBatchTypes").CatalogKeywordBatchProgress) => void) => () => void;
        cancelGeneratedKeywords: (request: { requestId: string }) => Promise<boolean>;
        onAutoKeywordProgress: (callback: (progress: import("../shared/catalogAutoKeywordTypes").CatalogAutoKeywordProgress) => void) => () => void;
        cancelFileDetails: (request: { requestId: string }) => Promise<boolean>;
        readTextPreview: (request: ComputerSearchAuthorization) => Promise<SkimTextPreview>;
        startDrag: (request: ComputerSearchAuthorizationBatch) => void;
      };
      search: {
        images: (search: SearchState, taskId: string) => Promise<ImageSearchResponse>;
        cancel: (taskId: string) => Promise<boolean>;
        refresh: (directoryIds?: string[]) => Promise<boolean>;
        onIndexChanged: (callback: () => void) => () => void;
      };
      index: {
        updateManualKeywords: (filePath: string, keywordText: string) => Promise<string[]>;
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
        getCatalogGrid: () => Promise<import("../shared/catalogGridPreferenceTypes").CatalogGridPreferenceMap>;
        getCatalogView: () => Promise<import("../shared/catalogViewPreferenceTypes").CatalogViewPreferenceMap>;
        updateCatalogView: (scopePath: string | null, patch: import("../shared/catalogViewPreferenceTypes").CatalogViewPreference) => Promise<import("../shared/catalogViewPreferenceTypes").CatalogViewPreferenceMap>;
        getCatalogGridSize: () => Promise<import("../shared/catalogGridPreferenceTypes").CatalogGridSizePreferenceMap>;
        updateCatalogGridSize: (scopePath: string | null, size: number) => Promise<import("../shared/catalogGridPreferenceTypes").CatalogGridSizePreferenceMap>;
        updateCatalogGrid: (scopePath: string | null, mode: import("../shared/catalogGridPreferenceTypes").CatalogGridMode) => Promise<import("../shared/catalogGridPreferenceTypes").CatalogGridPreferenceMap>;
        get: () => Promise<UserPreferences>;
        updateTheme: (themePreference: UserPreferences["themePreference"]) => Promise<UserPreferences>;
        updateWindowMaterial: (material: UserPreferences["windowMaterial"]) => Promise<UserPreferences>;
        updateUiFontSize: (size: UserPreferences["uiFontSize"]) => Promise<UserPreferences>;
        updateLanguage: (languagePreference: UserPreferences["languagePreference"]) => Promise<UserPreferences>;
        updateSort: (sortPreference: UserPreferences["sortPreference"]) => Promise<UserPreferences>;
        updateSkimSort: (skimSortPreference: UserPreferences["skimSortPreference"]) => Promise<UserPreferences>;
        updateAppearanceColors: (appearanceColors: UserPreferences["appearanceColors"]) => Promise<UserPreferences>;
        updateEdgeCollapse: (enabled: UserPreferences["edgeCollapseEnabled"]) => Promise<UserPreferences>;
        updateStandbyLineVisible: (standbyLineVisible: UserPreferences["standbyLineVisible"]) => Promise<UserPreferences>;
        updateLaunchAtLogin: (launchAtLogin: UserPreferences["launchAtLogin"]) => Promise<UserPreferences>;
        updateSystemNotifications: (enabled: UserPreferences["systemNotificationsEnabled"]) => Promise<UserPreferences>;
        updateAutoCacheOptimization: (enabled: UserPreferences["autoCacheOptimizationEnabled"]) => Promise<UserPreferences>;
        updateQuickActionGlobalEnabled: (quickActionGlobalEnabled: UserPreferences["quickActionGlobalEnabled"]) => Promise<UserPreferences>;
        updateCommandEnabled: (commandEnabled: UserPreferences["commandEnabled"]) => Promise<UserPreferences>;
        updateSearchLabelVisibility: (searchLabelVisibility: UserPreferences["searchLabelVisibility"]) => Promise<UserPreferences>;
        updateSkimSidebarFolders: (skimSidebarFolders: UserPreferences["skimSidebarFolders"]) => Promise<UserPreferences>;
        updateSkimSystemLocationsCollapsed: (collapsed: boolean) => Promise<UserPreferences>;
        updateShortcutActions: (shortcutActions: UserPreferences["stableShortcutActions"]) => Promise<ShortcutActionsUpdateResult>;
        shortcutAvailability: () => Promise<ShortcutAvailabilityResult>;
        beginShortcutCapture: () => Promise<boolean>;
        endShortcutCapture: () => Promise<ShortcutAvailabilityResult>;
        onChanged: (callback: (preferences: UserPreferences) => void) => () => void;
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
