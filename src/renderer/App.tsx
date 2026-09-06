import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { defaultAppearanceColors, getTextColorForBackground, isHexColor } from "./appearance";
import { executeQuickCommand, type QuickCommandConfirmationRequest } from "./commandExecutor";
import { parseQuickCommand } from "./commandParser";
import { useAlwaysOnTopController } from "./controllers/useAlwaysOnTopController";
import { useContentViewActivity } from "./controllers/useContentViewActivity";
import { useOperationHintController } from "./controllers/useOperationHintController";
import { useRuntimeModelController } from "./controllers/useRuntimeModelController";
import { useSearchIndexRefresh } from "./controllers/useSearchIndexRefresh";
import { useSkimNavigationHistory } from "./controllers/useSkimNavigationHistory";
import { useSkimReadController } from "./controllers/useSkimReadController";
import { useSettingsDataSynchronization } from "./controllers/useSettingsDataSynchronization";
import { useSystemThemeMode } from "./controllers/useSystemThemeMode";
import { useTransientFeedback } from "./controllers/useTransientFeedback";
import { getFileContextMenuStyle } from "./fileContextMenuShared";
import { getKeywordEditorExitDelay } from "./keywordEditorInteraction";
import {
  AddDroppedDirectoriesPanel,
  DeleteDirectoryPanel,
  DeleteFilesPanel,
  ReplaceDirectoriesPanel
} from "./dialogs/ConfirmationPanels";
import KeywordEditorCard from "./dialogs/KeywordEditorCard";
import type {
  DeleteFilesFeedback,
  DroppedDirectory,
  KeywordEditSession
} from "./dialogs/dialogTypes";
import { getCommonKeywords } from "./dialogs/keywordEditorModel";
import { normalizeWindowsPathKey } from "./filePath";
import { formatDisplayMessage } from "./formatting";
import { isEditableKeyboardTarget } from "./keyboardTarget";
import { emptySearchResponse, getAbsoluteWindowsDirectoryInput, getSearchDisplayExtensions } from "./search/searchViewModel";
import { parseAssistantInvocation } from "./assistant/assistantInvocation";
import { hasAiSearchScopeChanged, useAiSearchBeta } from "./ai-search";
import { defaultStableShortcutActions, getShortcutFromKeyboardEvent, normalizeStableShortcutActions } from "./shortcutActions";
import ResultStatus from "./results/ResultStatus";
import { ResultsView, type ResultsViewProps } from "./results/ResultsView";
import ResultsContextMenuLayer, { type ResultsContextMenuState } from "./results/ResultsContextMenuLayer";
import { SkimView, type SkimViewProps } from "./skim/SkimView";
import { countSkimRootLocations } from "./skim/SkimRootSections";
import { createInitialResultGridScrollMemory, getResultLayoutMode, type ResultGridScrollMemory } from "./virtualGridLayout";
import type { StableUiRenderer } from "./stable-ui/stableUiRendererTypes";
import { defaultUiFontSize, useUiFontSize } from "./typography";
import type {
  AppView,
  AppearanceColors,
  DirectoryAddResult,
  DirectoryItem,
  ImageIndexItem,
  LanguagePreference,
  ResolvedThemeMode,
  SearchLabelVisibilityPreferences,
  SearchState,
  ShortcutActionId,
  ShortcutActionPreferences,
  ShortcutActionsUpdateResult,
  SkimBrowseEntry,
  SkimBrowseOptions,
  SkimDisplayPreferences,
  SkimLocationShortcut,
  SortDirection,
  SortField,
  ThumbnailOptimizationStatus, UiFontSize, VisualCacheStats, ThemeMode, WindowMaterial
} from "../shared/types";
import { getActiveLanguage, resolveLanguagePreference, setActiveLanguage, t, type TranslationKey } from "../../electron/localization";
import { skimDefaultFileExtensionSet } from "../../electron/formatCapabilities";
type ShellState = "standby" | "normal";
type Cap7CEWindowBounds = { x: number; y: number; width: number; height: number };
type DialogName = "addDroppedDirectories" | "deleteDirectory" | "replaceDirectories" | "deleteFiles" | "editKeywords" | "clearCache" | "clearSkimCache" | null;
const readDroppedDirectories = (dataTransfer: DataTransfer): DroppedDirectory[] => {
  const directories: DroppedDirectory[] = [];
  const seenPaths = new Set<string>();
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== "file" || !item.webkitGetAsEntry()?.isDirectory) continue;
    const file = item.getAsFile();
    if (!file) continue;
    const filePath = window.cap7ce?.files.getPathForFile(file)?.trim() ?? "";
    const pathKey = filePath.toLocaleLowerCase();
    if (!filePath || seenPaths.has(pathKey)) continue;
    seenPaths.add(pathKey);
    directories.push({ name: file.name, path: filePath });
  }
  return directories;
};
type KeywordEditScrollSnapshot = {
  scrollMemory: ResultGridScrollMemory;
  shellState: Extract<ShellState, "normal">;
  search: SearchState;
};
type SkimReturnContext = {
  view: Exclude<AppView, "skim">;
  shellState: ShellState;
};

const defaultSkimBrowseOptions: SkimBrowseOptions = {
  query: "",
  fileFormat: "all",
  sortField: "name",
  sortDirection: "asc"
};
const defaultSkimSortPreference: Pick<SearchState, "sortField" | "sortDirection"> = {
  sortField: "file_name",
  sortDirection: "asc"
};
const defaultSkimDisplayPreferences: SkimDisplayPreferences = {
  mode: "skim",
  searchMode: "skim",
  customExtensions: [...skimDefaultFileExtensionSet],
  showHiddenFiles: false
};
const sortSkimBrowseEntries = (entries: SkimBrowseEntry[], options: SkimBrowseOptions) => {
  const direction = options.sortDirection === "asc" ? 1 : -1;
  return [...entries].sort((left, right) => {
    const leftKind = left.kind === "drive" ? 0 : left.kind === "folder" ? 1 : 2;
    const rightKind = right.kind === "drive" ? 0 : right.kind === "folder" ? 1 : 2;
    if (leftKind !== rightKind) return leftKind - rightKind;
    const fieldOrder = options.sortField === "modifiedAt"
      ? (Date.parse(left.modifiedAt ?? "") || 0) - (Date.parse(right.modifiedAt ?? "") || 0)
      : left.name.localeCompare(right.name, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
    const nameOrder = left.name.localeCompare(right.name, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
    return direction * (fieldOrder || nameOrder);
  });
};
const emptyVisualCacheStats: VisualCacheStats = {
  cacheCount: 0,
  totalBytes: 0,
  cachePaths: []
};

const emptyThumbnailOptimizationStatus: ThumbnailOptimizationStatus = {
  enabled: true,
  phase: "ready",
  queuedCount: 0,
  processedCount: 0,
  failedCount: 0,
  activeDurationMs: 0
};

const normalizeAppearanceColors = (appearanceColors?: Partial<AppearanceColors> & {
  light?: Partial<AppearanceColors>;
  dark?: Partial<AppearanceColors>;
}): AppearanceColors => {
  const migratedColors = appearanceColors?.light ?? appearanceColors?.dark;
  return {
    themeColor: isHexColor(appearanceColors?.themeColor)
      ? appearanceColors.themeColor.toUpperCase()
      : isHexColor(migratedColors?.themeColor)
        ? migratedColors.themeColor.toUpperCase()
        : defaultAppearanceColors.themeColor,
    accentColor: isHexColor(appearanceColors?.accentColor)
      ? appearanceColors.accentColor.toUpperCase()
      : isHexColor(migratedColors?.accentColor)
        ? migratedColors.accentColor.toUpperCase()
        : defaultAppearanceColors.accentColor
  };
};

const emptySearch: SearchState = {
  query: "",
  directoryId: "all",
  fileFormat: "all",
  sortField: "modified_at",
  sortDirection: "desc"
};

const normalizeShortcutForMatch = (shortcut: string) => shortcut.replace(/\s+/g, "").toLowerCase();

const hasShortcutModifier = (shortcut: string) => (
  /\b(ctrl|alt|shift|meta)\b/i.test(shortcut)
);

const matchesShortcutEvent = (event: KeyboardEvent, shortcut: string) => {
  if (event.isComposing || !shortcut) {
    return false;
  }

  const eventShortcut = getShortcutFromKeyboardEvent(event);
  if (!eventShortcut) {
    return false;
  }

  if (isEditableKeyboardTarget(event.target) && !hasShortcutModifier(shortcut) && eventShortcut !== "Esc") {
    return false;
  }

  return normalizeShortcutForMatch(eventShortcut) === normalizeShortcutForMatch(shortcut);
};

const createAllDirectoriesOption = (directories: DirectoryItem[]): DirectoryItem => {
  const timestamp = new Date().toISOString();
  return {
    id: "all",
    name: t("filter.allAddedDirectories"),
    path: "",
    indexedCount: directories.reduce((sum, directory) => sum + directory.indexedCount, 0),
    fileCount: directories.some((directory) => directory.fileCount === null)
      ? null
      : directories.reduce((sum, directory) => sum + (directory.fileCount ?? 0), 0),
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

const formatDirectoryAddFeedback = (result: DirectoryAddResult) => {
  if (result.cancelled) {
    return "";
  }
  if (result.added.length > 0 && result.ignored.length === 0 && result.failures.length === 0) {
    return t("directoryAdd.added", { count: result.added.length });
  }
  if (result.added.length > 0 || result.ignored.length + result.failures.length > 1) {
    return t("directoryAdd.summary", {
      added: result.added.length,
      ignored: result.ignored.length,
      failed: result.failures.length
    });
  }
  const ignored = result.ignored[0];
  if (ignored?.reason === "drive-root") {
    return t("directoryAdd.driveRootIgnored");
  }
  if (ignored?.reason === "already-added") {
    return t("directoryAdd.alreadyAdded");
  }
  if (ignored?.reason === "covered-by-existing") {
    return t("directoryAdd.coveredByExisting", { name: ignored.existingDirectory?.name ?? "" });
  }
  if (ignored) {
    return t("directoryAdd.noChanges");
  }
  const failure = result.failures[0];
  if (failure) {
    return t("directoryAdd.failed", { path: failure.inputPath });
  }
  return t("directoryAdd.noChanges");
};

interface AppProps {
  stableUiRenderer: StableUiRenderer;
}
const App = ({ stableUiRenderer: StableUiRenderer }: AppProps) => {
  const [view, setView] = useState<AppView>("home");
  const navigationEntriesRef = useRef<AppView[]>(["home"]);
  const navigationIndexRef = useRef(0);
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [, setLanguagePreference] = useState<LanguagePreference>("system");
  const [, setResolvedLanguage] = useState(() => getActiveLanguage());
  const systemTheme = useSystemThemeMode();
  const [appearanceColors, setAppearanceColors] = useState<AppearanceColors>(defaultAppearanceColors);
  const [uiFontSize, setUiFontSize] = useState<UiFontSize>(defaultUiFontSize); const [windowMaterial, setWindowMaterial] = useState<WindowMaterial>("acrylic");
  const [, setStandbyLineVisible] = useState(true);
  const [, setLaunchAtLogin] = useState(false);
  const [, setSystemNotificationsEnabled] = useState(true);
  const [operationHintsEnabled, setOperationHintsEnabled] = useState(true);
  const [aiRecognitionEnabled, setAiRecognitionEnabled] = useState(true);
  const [quickActionGlobalEnabled, setQuickActionGlobalEnabled] = useState(true);
  const [commandEnabled, setCommandEnabled] = useState(true);
  const [shortcutActions, setShortcutActions] = useState<ShortcutActionPreferences>(defaultStableShortcutActions);
  const [unavailableShortcutActionIds, setUnavailableShortcutActionIds] = useState<ShortcutActionId[]>([]);
  const [skimDisplay, setSkimDisplay] = useState<SkimDisplayPreferences>(defaultSkimDisplayPreferences);
  const [skimSidebarFolders, setSkimSidebarFolders] = useState<string[]>([]);
  const [skimSystemLocationsCollapsed, setSkimSystemLocationsCollapsed] = useState(false);
  const [skimSortPreference, setSkimSortPreference] = useState(defaultSkimSortPreference);
  const [stableSkimToggleRequestId, setStableSkimToggleRequestId] = useState(0);
  const [search, setSearch] = useState<SearchState>(emptySearch);
  const lastResultSearchRef = useRef<SearchState>(emptySearch);
  const [, setSearchLabelVisibility] = useState<SearchLabelVisibilityPreferences>({
    directory: true,
    sort: true,
    format: true,
    skimDisplay: true,
    ai: true
  });
  const [directories, setDirectories] = useState<DirectoryItem[]>([]);
  const [isLoadingDirectories, setIsLoadingDirectories] = useState(true);
  const [isAddingDirectory, setIsAddingDirectory] = useState(false);
  const [directoryServiceUnavailable, setDirectoryServiceUnavailable] = useState(false);
  const skimBrowseOptions = useMemo<SkimBrowseOptions>(() => ({
    ...defaultSkimBrowseOptions,
    sortField: skimSortPreference.sortField === "modified_at" ? "modifiedAt" : "name",
    sortDirection: skimSortPreference.sortDirection
  }), [skimSortPreference]);
  const {
    message: skimFeedback,
    show: showSkimFeedback,
    clear: clearSkimFeedback
  } = useTransientFeedback();
  const {
    entries: skimEntries,
    currentPath: skimCurrentPath,
    breadcrumbs: skimBreadcrumbs,
    isLoading: isSkimLoading,
    visualSessionId: skimVisualSessionId,
    load: loadSkimLocation,
    cancel: cancelSkimRead,
    reset: resetSkimLocation
  } = useSkimReadController({
    browseOptions: skimBrowseOptions,
    clearFeedback: clearSkimFeedback,
    showFeedback: showSkimFeedback
  });
  const {
    open: openStableSkimLocation,
    back: navigateStableSkimBack,
    forward: navigateStableSkimForward
  } = useSkimNavigationHistory(loadSkimLocation);
  const visibleSkimEntries = useMemo(() => {
    if (skimDisplay.mode === "all") return skimEntries;
    const customExtensions = new Set(skimDisplay.customExtensions);
    return skimEntries.filter((entry) => {
      const showHidden = skimDisplay.mode === "custom" && skimDisplay.showHiddenFiles;
      if (!showHidden && entry.hidden) return false;
      if (entry.kind !== "file") return true;
      return skimDisplay.mode === "skim"
        ? Boolean(entry.formatCapability?.defaultInSkim)
        : customExtensions.has(entry.extension);
    });
  }, [skimDisplay, skimEntries]);
  const sortedSkimEntries = useMemo(
    () => sortSkimBrowseEntries(visibleSkimEntries, skimBrowseOptions),
    [skimBrowseOptions, visibleSkimEntries]
  );
  const [skimLocations, setSkimLocations] = useState<SkimLocationShortcut[]>([
    { id: "computer", kind: "computer", path: null }
  ]);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [directoryToDelete, setDirectoryToDelete] = useState<string | null>(null);
  const [droppedDirectories, setDroppedDirectories] = useState<DroppedDirectory[]>([]);
  const [pendingDirectoryAddResult, setPendingDirectoryAddResult] = useState<DirectoryAddResult | null>(null);
  const directoryAddFeedbackTargetRef = useRef<"search" | "skim">("search");
  const internalNativeDragRef = useRef(false);
  const [editingDirectoryId, setEditingDirectoryId] = useState<string | null>(null);
  const {
    llamaRuntimeSettings,
    llamaRuntimeProcessState,
    ggufModelSettings,
    refreshLlamaRuntimeSettings,
    refreshGgufModelSettings,
    updateSelectedLlamaRuntime,
    updateSelectedGgufModel,
    startLlamaRuntimeServer,
    stopLlamaRuntimeServer
  } = useRuntimeModelController();
  const [, setVisualCacheStats] = useState<VisualCacheStats>(emptyVisualCacheStats);
  const [, setSkimCacheStats] = useState<VisualCacheStats>(emptyVisualCacheStats);
  const [thumbnailOptimizationStatus, setThumbnailOptimizationStatus] = useState<ThumbnailOptimizationStatus>(emptyThumbnailOptimizationStatus);
  const thumbnailOptimizationPhaseRef = useRef<ThumbnailOptimizationStatus["phase"]>(emptyThumbnailOptimizationStatus.phase);
  const thumbnailOptimizationStatsTimerRef = useRef<number | null>(null);
  const [, setIsLoadingCacheStats] = useState(true);
  const [contextMenu, setContextMenu] = useState<ResultsContextMenuState | null>(null);
  const [shellState, setShellState] = useState<ShellState>("standby");
  const { isAlwaysOnTop, applyAlwaysOnTop, setAlwaysOnTop, toggleAlwaysOnTop } = useAlwaysOnTopController();
  const [isMaximized, setIsMaximized] = useState(false);
  const [, setLastNormalBounds] = useState<Cap7CEWindowBounds | null>(null);
  const [filesPendingDelete, setFilesPendingDelete] = useState<ImageIndexItem[]>([]);
  const [isDeletingFiles, setIsDeletingFiles] = useState(false);
  const [deleteFilesFeedback, setDeleteFilesFeedback] = useState<DeleteFilesFeedback | null>(null);
  const [keywordEditSession, setKeywordEditSession] = useState<KeywordEditSession | null>(null);
  const [isKeywordEditorClosing, setIsKeywordEditorClosing] = useState(false);
  const [editKeywords, setEditKeywords] = useState("");
  const [editMetadataError, setEditMetadataError] = useState("");
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const keywordSaveInFlightRef = useRef(false);
  const keywordEditorClosingRef = useRef(false);
  const keywordEditorExitTimerRef = useRef<number | null>(null);
  const [searchResults, setSearchResults] = useState<ImageIndexItem[]>([]);
  const [selectedResultImageId, setSelectedResultImageId] = useState<string | null>(null);
  const [clearSelectionRequestId, setClearSelectionRequestId] = useState(0);
  const {
    message: quickCommandNotice,
    show: showQuickCommandNotice,
    clear: clearQuickCommandNotice
  } = useTransientFeedback();
  const aiSearchBeta = useAiSearchBeta({ setResults: setSearchResults, onFeedback: showQuickCommandNotice });
  const [pendingQuickCommandConfirmation, setPendingQuickCommandConfirmation] = useState<QuickCommandConfirmationRequest | null>(null);
  const resultScrollMemoryRef = useRef(createInitialResultGridScrollMemory());
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const directoryPathResolutionRequestRef = useRef(0);
  const searchTaskIdRef = useRef<string | null>(null);
  const viewDisplaySearchTimerRef = useRef<number | null>(null);
  const skimReturnContextRef = useRef<SkimReturnContext | null>(null);
  const lastClosedSkimPathRef = useRef<string | null>(null);
  const skimForwardPathsRef = useRef<string[]>([]);
  const keywordEditScrollSnapshotRef = useRef<KeywordEditScrollSnapshot | null>(null);
  const directoryDeleteInFlightRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const resultsInitializedRef = useRef(false);

  useEffect(() => () => {
    if (keywordEditorExitTimerRef.current !== null) {
      window.clearTimeout(keywordEditorExitTimerRef.current);
    }
  }, []);
  const directoryOptions = useMemo(() => [createAllDirectoriesOption(directories), ...directories], [directories]);
  const totalFileCount = directoryOptions[0]?.fileCount ?? null;
  const effectiveTheme: ResolvedThemeMode = theme === "system" ? systemTheme : theme;
  const uiFontStyle = useUiFontSize(uiFontSize);
  const appThemeStyle = {
    ...uiFontStyle,
    "--theme-color": appearanceColors.themeColor,
    "--accent-color": appearanceColors.accentColor,
    "--dialog-action-hover-text": getTextColorForBackground(appearanceColors.themeColor, appearanceColors.accentColor),
    "--theme-on-color": getTextColorForBackground(appearanceColors.themeColor),
    "--accent-on-color": getTextColorForBackground(appearanceColors.accentColor)
  } as CSSProperties;
  const contextMenuStyle = getFileContextMenuStyle(effectiveTheme, appearanceColors);
  const operationHint = useOperationHintController({
    query: search.query,
    enabled: operationHintsEnabled,
    commandEnabled,
    quickActionGlobalEnabled,
    unavailableShortcutActionIds,
    shortcutActions
  });
  const searchInputFeedback = quickCommandNotice || operationHint;
  const operationHintVisible = quickCommandNotice.length === 0 && operationHint.length > 0;
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    directoryPathResolutionRequestRef.current += 1;
  }, [search.query]);
  const cancelSearch = useCallback(() => {
    const taskId = searchTaskIdRef.current;
    searchTaskIdRef.current = null;
    if (taskId) {
      void window.cap7ce?.search.cancel(taskId);
    }
    setIsSearching(false);
  }, []);
  const resetShellBehaviorState = useCallback(() => {
    setIsMaximized(false);
    setLastNormalBounds(null);
  }, []);
  const resetSettingsViewState = useCallback((forceResultsView = false) => {
    navigationEntriesRef.current = ["results"];
    navigationIndexRef.current = 0;
    setView((currentView) => (
      forceResultsView || currentView === "settings" ? "results" : currentView
    ));
  }, []);
  useEffect(() => {
    const refreshOptimizationCacheStats = () => {
      void window.cap7ce?.cache.stats().then((stats) => {
        if (stats) {
          setVisualCacheStats(stats);
        }
      });
    };

    const unsubscribe = window.cap7ce?.cache.onOptimizationStatusChanged((status) => {
      const previousPhase = thumbnailOptimizationPhaseRef.current;
      thumbnailOptimizationPhaseRef.current = status.phase;
      setThumbnailOptimizationStatus(status);

      if (status.phase === "running") {
        if (thumbnailOptimizationStatsTimerRef.current === null) {
          thumbnailOptimizationStatsTimerRef.current = window.setTimeout(() => {
            thumbnailOptimizationStatsTimerRef.current = null;
            refreshOptimizationCacheStats();
          }, 5000);
        }
      } else {
        if (thumbnailOptimizationStatsTimerRef.current !== null) {
          window.clearTimeout(thumbnailOptimizationStatsTimerRef.current);
          thumbnailOptimizationStatsTimerRef.current = null;
        }
        if (status.phase === "completed" && previousPhase !== "completed") {
          refreshOptimizationCacheStats();
        }
      }
    });
    return () => {
      unsubscribe?.();
      if (thumbnailOptimizationStatsTimerRef.current !== null) {
        window.clearTimeout(thumbnailOptimizationStatsTimerRef.current);
        thumbnailOptimizationStatsTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (shellState !== "normal") {
      setIsMaximized(false);
    }
  }, [shellState]);

  const contentViewActivityConfirmed = useContentViewActivity(cancelSearch);

  useEffect(() => {
    const resultGridMounted = true;
    if (!resultGridMounted) {
      void window.cap7ce?.cache.discardQueuedInteractiveThumbnails();
    }
  }, []);

  const closeNavigationOverlays = useCallback(() => {
    setContextMenu(null);
  }, []);

  const dismissCancellableDialog = useCallback((notifyReplacementCancellation = false) => {
    setDirectoryToDelete(null); setDroppedDirectories([]); setPendingDirectoryAddResult(null);
    setFilesPendingDelete([]); setDeleteFilesFeedback(null);
    setDialog(null);
    if (notifyReplacementCancellation) {
      if (directoryAddFeedbackTargetRef.current === "skim") showSkimFeedback(t("command.cancelled"));
      else showQuickCommandNotice(t("command.cancelled"));
    }
    directoryAddFeedbackTargetRef.current = "search";
  }, [showQuickCommandNotice, showSkimFeedback]);

  const dismissTransientInteractionsForStandby = useCallback(() => {
    closeNavigationOverlays();
    if (keywordEditorExitTimerRef.current !== null) {
      window.clearTimeout(keywordEditorExitTimerRef.current);
      keywordEditorExitTimerRef.current = null;
    }
    keywordEditorClosingRef.current = false; keywordEditScrollSnapshotRef.current = null;
    setKeywordEditSession(null); setEditKeywords("");
    setEditMetadataError(""); setIsKeywordEditorClosing(false);
    dismissCancellableDialog();
    setEditingDirectoryId(null); setPendingQuickCommandConfirmation(null);
  }, [closeNavigationOverlays, dismissCancellableDialog]);

  const enterStandby = useCallback(() => {
    if (
      isAddingDirectory
      || isDeletingFiles || isSavingMetadata || keywordSaveInFlightRef.current
      || directoryDeleteInFlightRef.current
    ) return;
    dismissTransientInteractionsForStandby();
    resetShellBehaviorState();
    void window.cap7ce?.window.setShellState("standby");
  }, [dismissTransientInteractionsForStandby, isAddingDirectory, isDeletingFiles, isSavingMetadata, resetShellBehaviorState]);

  const navigateTo = useCallback((nextView: AppView) => {
    const entries = navigationEntriesRef.current;
    const currentIndex = navigationIndexRef.current;
    closeNavigationOverlays();
    if (entries[currentIndex] === nextView) {
      return;
    }

    const nextEntries = [...entries.slice(0, currentIndex + 1), nextView];
    navigationEntriesRef.current = nextEntries;
    navigationIndexRef.current = nextEntries.length - 1;
    setView(nextView);
  }, [closeNavigationOverlays]);

  const navigateBack = useCallback(() => {
    const nextIndex = navigationIndexRef.current - 1;
    if (nextIndex < 0) {
      return;
    }

    navigationIndexRef.current = nextIndex;
    closeNavigationOverlays();
    setView(navigationEntriesRef.current[nextIndex]);
  }, [closeNavigationOverlays]);

  const navigateForward = useCallback(() => {
    const nextIndex = navigationIndexRef.current + 1;
    if (nextIndex >= navigationEntriesRef.current.length) {
      return;
    }

    navigationIndexRef.current = nextIndex;
    closeNavigationOverlays();
    setView(navigationEntriesRef.current[nextIndex]);
  }, [closeNavigationOverlays]);

  const refreshVisualCacheStats = async () => {
    setIsLoadingCacheStats(true);
    try {
      const [stats, currentSkimCacheStats] = await Promise.all([
        window.cap7ce?.cache.stats(),
        window.cap7ce?.skimCache.stats()
      ]);
      if (stats) {
        setVisualCacheStats(stats);
      }
      if (currentSkimCacheStats) {
        setSkimCacheStats(currentSkimCacheStats);
      }
    } finally {
      setIsLoadingCacheStats(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadDirectories = async () => {
      setIsLoadingDirectories(true);
      setIsLoadingCacheStats(true);
      try {
        const loadedDirectories = (await window.cap7ce?.directories.list()) ?? [];
        const missingFileCountIds = loadedDirectories
          .filter((directory) => directory.fileCount === null)
          .map((directory) => directory.id);
        const cacheOptimizationStatus = await window.cap7ce?.cache.optimizationStatus();
        const preferences = await window.cap7ce?.preferences.get();
        const loadedSkimLocations = await window.cap7ce?.skim.listLocations();
        const shortcutAvailability = await window.cap7ce?.preferences.shortcutAvailability();
        if (isMounted) {
          setDirectories(loadedDirectories);
          if (missingFileCountIds.length > 0) {
            void window.cap7ce?.directories.refreshFileCounts(missingFileCountIds).then((countedDirectories) => {
              if (isMounted && countedDirectories) {
                setDirectories(countedDirectories);
              }
            }).catch(() => undefined);
          }
          setDirectoryServiceUnavailable(false);
          if (preferences) {
            const resolvedLanguage = resolveLanguagePreference(preferences.languagePreference, navigator.language);
            setActiveLanguage(resolvedLanguage);
            setResolvedLanguage(resolvedLanguage);
            setTheme(preferences.themePreference);
            setAppearanceColors(normalizeAppearanceColors(preferences.appearanceColors));
            setUiFontSize(preferences.uiFontSize); setWindowMaterial(preferences.windowMaterial);
            applyAlwaysOnTop(preferences.alwaysOnTop);
            setStandbyLineVisible(preferences.standbyLineVisible);
            setLaunchAtLogin(preferences.launchAtLogin);
            setSystemNotificationsEnabled(preferences.systemNotificationsEnabled);
            setOperationHintsEnabled(preferences.operationHintsEnabled);
            setAiRecognitionEnabled(preferences.aiRecognitionEnabled);
            setQuickActionGlobalEnabled(preferences.quickActionGlobalEnabled);
            setCommandEnabled(preferences.commandEnabled);
            setShortcutActions(normalizeStableShortcutActions(preferences.stableShortcutActions));
            setSearchLabelVisibility(preferences.searchLabelVisibility);
            setSkimDisplay(preferences.skimDisplay);
            setSkimSidebarFolders(preferences.skimSidebarFolders);
            setSkimSystemLocationsCollapsed(preferences.skimSystemLocationsCollapsed);
            setSkimSortPreference(preferences.skimSortPreference);
            if (!resultsInitializedRef.current) {
              lastResultSearchRef.current = {
                ...lastResultSearchRef.current,
                sortField: preferences.sortPreference.sortField,
                sortDirection: preferences.sortPreference.sortDirection
              };
            }
            setSearch((current) => ({
              ...current,
              sortField: preferences.sortPreference.sortField,
              sortDirection: preferences.sortPreference.sortDirection
            }));
          }
          if (loadedSkimLocations?.length) setSkimLocations(loadedSkimLocations);
          setUnavailableShortcutActionIds(shortcutAvailability?.unavailableActionIds ?? []);
          if (cacheOptimizationStatus) {
            thumbnailOptimizationPhaseRef.current = cacheOptimizationStatus.phase;
            setThumbnailOptimizationStatus(cacheOptimizationStatus);
          }
        }
      } finally {
        if (isMounted) {
          setIsLoadingDirectories(false);
          setIsLoadingCacheStats(false);
        }
      }
    };

    loadDirectories();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => () => {
    if (searchTaskIdRef.current) {
      void window.cap7ce?.search.cancel(searchTaskIdRef.current);
      searchTaskIdRef.current = null;
    }
    if (viewDisplaySearchTimerRef.current !== null) {
      window.clearTimeout(viewDisplaySearchTimerRef.current);
      viewDisplaySearchTimerRef.current = null;
    }
  }, []);

  const runSearch = async (
    nextSearch = search,
    options?: { navigate?: boolean; display?: SkimDisplayPreferences; aiEnhanced?: boolean; preserveAiResults?: boolean }
  ) => {
    if (viewDisplaySearchTimerRef.current !== null) {
      window.clearTimeout(viewDisplaySearchTimerRef.current);
      viewDisplaySearchTimerRef.current = null;
    }
    cancelSearch();
    const taskId = window.crypto?.randomUUID?.() ?? `search-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    searchTaskIdRef.current = taskId;
    setContextMenu(null);
    clearQuickCommandNotice();
    setIsSearching(true);
    setSearchError("");
    resultsInitializedRef.current = true;
    lastResultSearchRef.current = nextSearch;
    if (options?.navigate !== false) {
      navigateTo("results");
    }
    try {
      let searchRequest = {
        ...nextSearch,
        includedExtensions: getSearchDisplayExtensions(options?.display ?? skimDisplay)
      };
      let response = (await window.cap7ce?.search.images(searchRequest, taskId)) ?? emptySearchResponse;
      if (searchTaskIdRef.current !== taskId) return;
      if (
        !Array.isArray(response)
        && nextSearch.fileFormat !== "all"
        && !response.availableFormats.includes(nextSearch.fileFormat)
      ) {
        const fallbackSearch = { ...nextSearch, fileFormat: "all" };
        setSearch(fallbackSearch);
        lastResultSearchRef.current = fallbackSearch;
        searchRequest = {
          ...fallbackSearch,
          includedExtensions: searchRequest.includedExtensions
        };
        response = (await window.cap7ce?.search.images(searchRequest, taskId)) ?? emptySearchResponse;
        if (searchTaskIdRef.current !== taskId) return;
      }
      const baseResults = Array.isArray(response) ? response : response.images;
      setSearchResults(options?.preserveAiResults ? aiSearchBeta.mergePreservedResults(baseResults) : baseResults);
      if (options?.aiEnhanced) void aiSearchBeta.start(searchRequest, baseResults);
    } catch {
      if (searchTaskIdRef.current !== taskId) return;
      setSearchResults([]);
      setSearchError(t("search.failed"));
    } finally {
      if (searchTaskIdRef.current === taskId) {
        searchTaskIdRef.current = null;
        setIsSearching(false);
      }
    }
  };

  useEffect(() => {
    if (isLoadingDirectories || !contentViewActivityConfirmed || resultsInitializedRef.current) return;
    const initialSearch = { ...emptySearch, sortField: search.sortField, sortDirection: search.sortDirection };
    setSearch(initialSearch);
    void runSearch(initialSearch, { navigate: false });
  }, [contentViewActivityConfirmed, isLoadingDirectories]);

  const updateResultsSearch = (nextSearch: SearchState, refresh = false) => {
    setSearch(nextSearch);
    if (nextSearch.sortField !== search.sortField || nextSearch.sortDirection !== search.sortDirection) {
      void window.cap7ce?.preferences.updateSort({
        sortField: nextSearch.sortField,
        sortDirection: nextSearch.sortDirection
      });
    }
    if (refresh) {
      const aiScopeChanged = hasAiSearchScopeChanged(search, nextSearch);
      if (aiScopeChanged) aiSearchBeta.cancelActive();
      void runSearch(nextSearch, aiScopeChanged ? { aiEnhanced: aiSearchBeta.enabled } : { preserveAiResults: true });
    }
  };
  const updateTheme = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    void window.cap7ce?.preferences.updateTheme(nextTheme);
  };
  const updateWindowMaterial = async (nextMaterial: WindowMaterial) => {
    setWindowMaterial(nextMaterial);
    const preferences = await window.cap7ce?.preferences.updateWindowMaterial(nextMaterial);
    if (preferences) setWindowMaterial(preferences.windowMaterial);
  };
  const updateUiFontSize = async (nextSize: UiFontSize) => {
    setUiFontSize(nextSize);
    const preferences = await window.cap7ce?.preferences.updateUiFontSize(nextSize);
    if (preferences) setUiFontSize(preferences.uiFontSize);
  };

  const updateLanguage = async (nextLanguagePreference: LanguagePreference) => {
    const preferences = await window.cap7ce?.preferences.updateLanguage(nextLanguagePreference);
    const appliedPreference = preferences?.languagePreference ?? nextLanguagePreference;
    const resolvedLanguage = resolveLanguagePreference(appliedPreference, navigator.language);
    setActiveLanguage(resolvedLanguage);
    setResolvedLanguage(resolvedLanguage);
  };

  const updateAppearanceColors = (nextAppearanceColors: AppearanceColors) => {
    const normalizedColors = normalizeAppearanceColors(nextAppearanceColors);
    setAppearanceColors(normalizedColors);
    void window.cap7ce?.preferences.updateAppearanceColors(normalizedColors);
  };

  const showSortNotice = (sortField: SortField, sortDirection: SortDirection) => {
    const noticeKey: TranslationKey = sortField === "modified_at"
      ? (sortDirection === "desc" ? "search.sortSwitched.modifiedAtDesc" : "search.sortSwitched.modifiedAtAsc")
      : (sortDirection === "asc" ? "search.sortSwitched.fileNameAsc" : "search.sortSwitched.fileNameDesc");
    showQuickCommandNotice(t(noticeKey));
  };

  const updateSkimSort = (nextSearch: SearchState, announceChange = true) => {
    const nextSkimSortPreference = {
      sortField: nextSearch.sortField,
      sortDirection: nextSearch.sortDirection
    };
    setSkimSortPreference(nextSkimSortPreference);
    void window.cap7ce?.preferences.updateSkimSort(nextSkimSortPreference);
    if (announceChange && (
      nextSkimSortPreference.sortField !== skimSortPreference.sortField
      || nextSkimSortPreference.sortDirection !== skimSortPreference.sortDirection
    )) {
      showSortNotice(nextSkimSortPreference.sortField, nextSkimSortPreference.sortDirection);
    }
  };

  const updateStandbyLineVisible = (nextStandbyLineVisible: boolean) => {
    setStandbyLineVisible(nextStandbyLineVisible);
    void window.cap7ce?.preferences.updateStandbyLineVisible(nextStandbyLineVisible);
  };

  const updateLaunchAtLogin = async (nextLaunchAtLogin: boolean) => {
    setLaunchAtLogin(nextLaunchAtLogin);
    const preferences = await window.cap7ce?.preferences.updateLaunchAtLogin(nextLaunchAtLogin);
    if (preferences) {
      setLaunchAtLogin(preferences.launchAtLogin);
    }
  };

  const updateOperationHints = async (enabled: boolean) => {
    setOperationHintsEnabled(enabled);
    const preferences = await window.cap7ce?.preferences.updateOperationHints(enabled);
    if (preferences) {
      setOperationHintsEnabled(preferences.operationHintsEnabled);
    }
  };

  const updateAutoCacheOptimization = async (enabled: boolean) => {
    const preferences = await window.cap7ce?.preferences.updateAutoCacheOptimization(enabled);
    const status = await window.cap7ce?.cache.optimizationStatus();
    if (status) {
      thumbnailOptimizationPhaseRef.current = status.phase;
      setThumbnailOptimizationStatus(status);
    } else if (preferences) {
      const fallbackStatus: ThumbnailOptimizationStatus = {
        ...thumbnailOptimizationStatus,
        enabled: preferences.autoCacheOptimizationEnabled,
        phase: preferences.autoCacheOptimizationEnabled ? "ready" : "disabled"
      };
      thumbnailOptimizationPhaseRef.current = fallbackStatus.phase;
      setThumbnailOptimizationStatus(fallbackStatus);
    }
  };

  const updateAiRecognitionEnabled = async (enabled: boolean) => {
    setAiRecognitionEnabled(enabled);
    if (!enabled) aiSearchBeta.deactivate();
    const preferences = await window.cap7ce?.preferences.updateAiRecognitionEnabled(enabled);
    if (preferences) setAiRecognitionEnabled(preferences.aiRecognitionEnabled);
  };

  const updateQuickActionGlobalEnabled = (nextQuickActionGlobalEnabled: boolean) => {
    if (!nextQuickActionGlobalEnabled) {
      setQuickActionGlobalEnabled(false);
    }
    return window.cap7ce?.preferences.updateQuickActionGlobalEnabled(nextQuickActionGlobalEnabled).then(async (preferences) => {
      const shortcutAvailability = await window.cap7ce?.preferences.shortcutAvailability();
      setUnavailableShortcutActionIds(shortcutAvailability?.unavailableActionIds ?? []);
      if (preferences) {
        setQuickActionGlobalEnabled(preferences.quickActionGlobalEnabled);
        return preferences.quickActionGlobalEnabled;
      }
      return false;
    }) ?? Promise.resolve(false);
  };

  const updateShortcutActions = async (nextShortcutActions: ShortcutActionPreferences): Promise<ShortcutActionsUpdateResult | null> => {
    const normalizedShortcutActions = normalizeStableShortcutActions(nextShortcutActions);
    try {
      const result = await window.cap7ce?.preferences.updateShortcutActions(normalizedShortcutActions);
      if (!result) return null;
      if (result.applied) {
        setShortcutActions(normalizeStableShortcutActions(result.preferences.stableShortcutActions));
        setUnavailableShortcutActionIds(result.unavailableActionIds);
      }
      return result;
    } catch {
      return null;
    }
  };

  const updateCommandEnabled = async (nextCommandEnabled: boolean) => {
    setCommandEnabled(nextCommandEnabled);
    const preferences = await window.cap7ce?.preferences.updateCommandEnabled(nextCommandEnabled);
    if (preferences) {
      setCommandEnabled(preferences.commandEnabled);
    }
  };

  const findDirectoryByCommandName = (directoryName: string) => (
    directories.find((directory) => directory.name === directoryName)
  );

  const getCommandBaseSearch = () => (
    resultsInitializedRef.current
      ? lastResultSearchRef.current
      : {
          ...emptySearch,
          sortField: search.sortField,
          sortDirection: search.sortDirection
        }
  );

  const selectCommandDirectory = (directoryName: string) => {
    const directory = directoryName.toLowerCase() === "all"
      ? directoryOptions.find((candidate) => candidate.id === "all")
      : findDirectoryByCommandName(directoryName);
    if (!directory) {
      return false;
    }

    const nextSearch = { ...getCommandBaseSearch(), directoryId: directory.id };
    updateResultsSearch(nextSearch, true);
    return true;
  };

  const setCommandShellMode = () => void enterStandby();

  useEffect(() => {
    const unsubscribe = window.cap7ce?.window.onActivateShellModeShortcut?.((mode) => {
      if (mode === "standby") setCommandShellMode();
      if (mode === "standby" || dialog) return;
      window.setTimeout(() => searchInputRef.current?.focus({ preventScroll: true }), 80);
    });
    return () => unsubscribe?.();
  }, [dialog, setCommandShellMode]);

  const commandOperationFailed = (message: string) => ({ ok: false as const, message });

  const refreshCommandDirectoryStatus = async () => {
    try {
      const nextDirectories = await window.cap7ce?.directories.list();
      refreshDirectories(nextDirectories ?? []);
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("error.directoryStatusRefreshFailed"));
    }
  };

  const refreshCommandLlamaRuntimes = async () => {
    try {
      await refreshLlamaRuntimeSettings();
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("error.runtimeRefreshFailed"));
    }
  };

  const startCommandLlamaRuntime = async () => {
    if (llamaRuntimeProcessState.status === "running" || llamaRuntimeProcessState.status === "starting") {
      return commandOperationFailed(t("error.runtimeAlreadyRunning"));
    }

    try {
      const state = await startLlamaRuntimeServer();
      if (!state) {
        return commandOperationFailed(t("error.runtimeStartFailed"));
      }
      if (state.status === "failed") {
        return commandOperationFailed(state.message ?? t("error.runtimeStartFailed"));
      }
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("error.runtimeStartFailed"));
    }
  };

  const selectCommandLlamaRuntime = async (version: string) => {
    if (aiSearchBeta.busy) {
      return commandOperationFailed(t("error.stopAiSearchFirst"));
    }

    const runtime = llamaRuntimeSettings.versions.find((item) => item.version === version);
    if (!runtime) {
      return commandOperationFailed(t("error.runtimeVersionNotFound"));
    }

    try {
      const settings = await updateSelectedLlamaRuntime(runtime.version);
      if (!settings) {
        return commandOperationFailed(t("error.runtimeSwitchFailed"));
      }
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("error.runtimeSwitchFailed"));
    }
  };

  const refreshCommandVisionModels = async () => {
    try {
      await refreshGgufModelSettings();
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("error.modelRefreshFailed"));
    }
  };

  const selectCommandVisionModel = async (modelName: string) => {
    if (aiSearchBeta.busy) {
      return commandOperationFailed(t("error.stopAiSearchFirst"));
    }

    const model = ggufModelSettings.models.find((item) => (
      item.name === modelName || item.modelFile.name === modelName
    ));
    if (!model) {
      return commandOperationFailed(t("error.modelNotFound"));
    }

    try {
      const settings = await updateSelectedGgufModel(model.id);
      if (!settings) {
        return commandOperationFailed(t("error.modelSwitchFailed"));
      }
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("error.modelSwitchFailed"));
    }
  };

  const deleteCommandDirectory = async (directoryName: string) => {
    const directory = findDirectoryByCommandName(directoryName);
    if (!directory) {
      return commandOperationFailed(t("command.directoryNotFound"));
    }

    try {
      await deleteDirectoryById(directory.id);
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("command.directoryDeleteFailed"));
    }
  };

  const renameCommandDirectory = async (directoryName: string, nextName: string) => {
    const directory = findDirectoryByCommandName(directoryName);
    const normalizedNextName = nextName.trim();
    if (!directory) {
      return commandOperationFailed(t("command.directoryNotFound"));
    }
    if (!normalizedNextName) {
      return commandOperationFailed(t("command.directoryNameEmpty"));
    }

    try {
      const nextDirectories = await window.cap7ce?.directories.updateName(directory.id, normalizedNextName);
      if (!nextDirectories) {
        return commandOperationFailed(t("error.directoryRenameFailed"));
      }
      refreshDirectories(nextDirectories);
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("error.directoryRenameFailed"));
    }
  };

  const maximizeCommandWindow = async () => {
    try {
      if (shellState !== "normal") {
        resetSettingsViewState(true);
        const applied = await window.cap7ce?.window.setShellState("normal");
        if (applied === false) {
          return commandOperationFailed(t("error.normalWindowSwitchFailed"));
        }
        setShellState("normal");
      }

      if (!isMaximized) {
        const nextState = await window.cap7ce?.window.toggleNormalMaximized();
        if (!nextState?.isMaximized) {
          return commandOperationFailed(t("error.windowMaximizeFailed"));
        }
        setIsMaximized(nextState.isMaximized);
        setLastNormalBounds(nextState.lastNormalBounds);
      }
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("error.windowMaximizeFailed"));
    }
  };

  const resetCommandWindow = async () => {
    try {
      const applied = await window.cap7ce?.window.setShellState("normal", { forceBounds: true });
      if (applied === false) return commandOperationFailed(t("error.normalWindowSwitchFailed"));
      resetSettingsViewState(true);
      setShellState("normal");
      setIsMaximized(false);
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("error.normalWindowSwitchFailed"));
    }
  };

  const setCommandAlwaysOnTop = async (enabled: boolean) => {
    try {
      const state = await setAlwaysOnTop(enabled);
      if (!state || state.actual !== enabled) {
        return commandOperationFailed(enabled ? t("error.windowPinEnableFailed") : t("error.windowPinDisableFailed"));
      }
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("error.windowPinUpdateFailed"));
    }
  };

  const getCommandLlamaStopBlocker = () => {
    if (aiSearchBeta.busy) {
      return t("error.stopAiSearchFirst");
    }
    if (llamaRuntimeProcessState.status !== "running" && llamaRuntimeProcessState.status !== "starting") {
      return t("error.runtimeNotRunning");
    }
    return null;
  };

  const stopCommandLlamaRuntime = async () => {
    try {
      const state = await stopLlamaRuntimeServer();
      if (!state || state.status === "failed") {
        return commandOperationFailed(state?.message ?? t("error.runtimeStopFailed"));
      }
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("error.runtimeStopFailed"));
    }
  };

  const clearCommandCache = async (scope: "all" | "thumbnails" = "all") => {
    try {
      const token = await window.cap7ce?.cache.authorizeClear();
      if (!token) {
        return commandOperationFailed(t("error.cacheFailed"));
      }
      const stats = await (scope === "thumbnails" ? window.cap7ce?.cache.clearThumbnails(token) : window.cap7ce?.cache.clearAll(token));
      if (stats) {
        setVisualCacheStats(stats);
      } else {
        await refreshVisualCacheStats();
      }
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("error.cacheFailed"));
    }
  };

  const updateResultsSearchOptions = (nextSearch: SearchState) => {
    const nextDirectory = nextSearch.directoryId !== search.directoryId
      ? directoryOptions.find((directory) => directory.id === nextSearch.directoryId)
      : undefined;
    const sortChanged = nextSearch.sortField !== search.sortField
      || nextSearch.sortDirection !== search.sortDirection;
    updateResultsSearch(nextSearch, true);
    if (nextDirectory) {
      showQuickCommandNotice(nextDirectory.id === "all"
        ? t("search.allDirectoriesSwitched")
        : t("search.directorySwitched", { name: nextDirectory.name }));
    } else if (sortChanged) {
      showSortNotice(nextSearch.sortField, nextSearch.sortDirection);
    }
  };

  const toggleAiSearchBeta = () => {
    if (!aiRecognitionEnabled) {
      showQuickCommandNotice(t("search.aiRecognitionDisabled"));
      return;
    }
    if (aiSearchBeta.enabled) {
      aiSearchBeta.deactivate();
      return;
    }
    aiSearchBeta.activate();
    void aiSearchBeta.start(lastResultSearchRef.current, searchResults);
  };

  const setCommandAiSearch = (enabled: boolean) => {
    if (enabled && !aiRecognitionEnabled) return commandOperationFailed(t("search.aiRecognitionDisabled"));
    if (!enabled) {
      aiSearchBeta.deactivate();
    } else if (aiSearchBeta.phase === "paused_user") {
      aiSearchBeta.toggleCurrentSearch(lastResultSearchRef.current, searchResults);
    } else if (!aiSearchBeta.busy) {
      if (!aiSearchBeta.enabled) aiSearchBeta.activate();
      void aiSearchBeta.start(lastResultSearchRef.current, searchResults);
    }
    return { ok: true as const };
  };

  const addCommandDirectory = async (directoryPath: string) => {
    if (isAddingDirectory) return commandOperationFailed(t("command.taskRunning"));
    setIsAddingDirectory(true);
    try {
      const result = await window.cap7ce?.directories.addCandidates({ candidates: [directoryPath] });
      if (!result) return commandOperationFailed(t("directoryAdd.noChanges"));
      await applyDirectoryAddResult(result, false);
      if (result.conflicts.length > 0) {
        setPendingDirectoryAddResult(result);
        setDialog("replaceDirectories");
        return { ok: true as const, message: t("command.directoryAddNeedsConfirmation") };
      }
      const message = formatDirectoryAddFeedback(result);
      return result.failures.length > 0 ? commandOperationFailed(message) : { ok: true as const, message };
    } catch (error) {
      return commandOperationFailed(formatDisplayMessage(error instanceof Error ? error.message : t("directoryAdd.noChanges")));
    } finally {
      setIsAddingDirectory(false);
    }
  };
  const cycleSearchDirectory = () => {
    if (directoryOptions.length <= 1) return;
    const currentIndex = directoryOptions.findIndex((directory) => directory.id === search.directoryId);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % directoryOptions.length;
    updateResultsSearchOptions({ ...search, directoryId: directoryOptions[nextIndex].id });
  };

  const updateSkimDisplay = (nextSkimDisplay: SkimDisplayPreferences, announceChange = true) => {
    const changedDisplayMode = nextSkimDisplay.searchMode !== skimDisplay.searchMode
      ? nextSkimDisplay.searchMode
      : (nextSkimDisplay.mode !== skimDisplay.mode ? nextSkimDisplay.mode : null);
    setSkimDisplay(nextSkimDisplay);
    if (viewDisplaySearchTimerRef.current !== null) {
      window.clearTimeout(viewDisplaySearchTimerRef.current);
      viewDisplaySearchTimerRef.current = null;
    }
    if (resultsInitializedRef.current) {
      const searchModeChanged = nextSkimDisplay.searchMode !== skimDisplay.searchMode;
      const customRangeChanged = nextSkimDisplay.searchMode === "custom"
        && nextSkimDisplay.customExtensions.join("|") !== skimDisplay.customExtensions.join("|");
      if (searchModeChanged) {
        aiSearchBeta.cancelActive();
        void runSearch(lastResultSearchRef.current, { navigate: false, display: nextSkimDisplay, aiEnhanced: aiSearchBeta.enabled });
      } else if (customRangeChanged) {
        viewDisplaySearchTimerRef.current = window.setTimeout(() => {
          viewDisplaySearchTimerRef.current = null;
          aiSearchBeta.cancelActive();
          void runSearch(lastResultSearchRef.current, { navigate: false, display: nextSkimDisplay, aiEnhanced: aiSearchBeta.enabled });
        }, 300);
      }
    }
    void window.cap7ce?.preferences.updateSkimDisplay(nextSkimDisplay).then((preferences) => {
      if (preferences) setSkimDisplay(preferences.skimDisplay);
    });
    if (changedDisplayMode && announceChange) {
      showQuickCommandNotice(t(`search.displaySwitched.${changedDisplayMode}` as TranslationKey));
    }
  };

  const updateSystemNotifications = async (enabled: boolean) => {
    const preferences = await window.cap7ce?.preferences.updateSystemNotifications(enabled);
    if (preferences) {
      setSystemNotificationsEnabled(preferences.systemNotificationsEnabled);
    }
  };

  const clearCommandSkimCache = async () => {
    try {
      const token = await window.cap7ce?.skimCache.authorizeClear();
      if (!token) {
        return commandOperationFailed(t("error.cacheFailed"));
      }
      const stats = await window.cap7ce?.skimCache.clear(token);
      if (stats) {
        setSkimCacheStats(stats);
      } else {
        await refreshVisualCacheStats();
      }
      if (view === "skim") {
        void loadSkimLocation(skimCurrentPath);
      }
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("error.cacheFailed"));
    }
  };

  const quitCommandApp = async () => {
    try {
      await window.cap7ce?.app.quit();
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("error.quitFailed"));
    }
  };

  const handlePendingQuickCommandConfirmation = (input: string) => {
    const pendingConfirmation = pendingQuickCommandConfirmation;
    if (!pendingConfirmation) {
      return false;
    }

    const normalizedInput = input.trim().toLowerCase();
    if (normalizedInput === "n") {
      setPendingQuickCommandConfirmation(null);
      setSearch((currentSearch) => ({ ...currentSearch, query: "" }));
      showQuickCommandNotice(t("command.cancelled"));
      return true;
    }

    if (normalizedInput !== "y") {
      setSearch((currentSearch) => ({ ...currentSearch, query: "" }));
      showQuickCommandNotice(t("command.enterYesOrNo"), true);
      return true;
    }

    setPendingQuickCommandConfirmation(null);
    setSearch((currentSearch) => ({ ...currentSearch, query: "" }));
    void pendingConfirmation.execute().then((result) => {
      showQuickCommandNotice(result.ok ? pendingConfirmation.successMessage : result.message || pendingConfirmation.failureMessage);
    });
    return true;
  };

  const submitQuickCommandIfNeeded = (nextSearch = search) => {
    if (handlePendingQuickCommandConfirmation(nextSearch.query)) {
      return true;
    }

    const quickCommandResult = parseQuickCommand(nextSearch.query, { commandEnabled });
    if (quickCommandResult.type === "search") {
      return false;
    }

    if (quickCommandResult.type === "missing-argument") {
      setSearch((currentSearch) => ({ ...currentSearch, query: "" }));
      showQuickCommandNotice(t("command.missingArgument", { message: quickCommandResult.message }));
      return true;
    }

    if (quickCommandResult.type === "unknown") {
      setSearch((currentSearch) => ({ ...currentSearch, query: "" }));
      showQuickCommandNotice(t("command.invalid", { command: quickCommandResult.command.raw }));
      return true;
    }

    void executeQuickCommand(quickCommandResult.command, {
      defaultAppearanceColors,
      defaultShortcutActions: defaultStableShortcutActions,
      currentAppearanceColors: appearanceColors,
      openSettings: () => openSettingsWindow(),
      openSkim,
      openSkimRoot: () => {
        if (view === "skim") {
          void loadSkimLocation(null);
        } else {
          openSkim();
        }
      },
      updateTheme,
      updateWindowMaterial,
      updateUiFontSize,
      updateLanguage,
      updateAppearanceColors,
      updateStandbyLineVisible,
      updateEdgeCollapse: async (enabled) => { await window.cap7ce?.preferences.updateEdgeCollapse(enabled); },
      updateLaunchAtLogin,
      updateSystemNotifications,
      updateOperationHints,
      updateAutoCacheOptimization,
      updateAiRecognitionEnabled,
      updateQuickActionGlobalEnabled,
      updateShortcutActions: async (nextShortcutActions) => (
        (await updateShortcutActions(nextShortcutActions))?.applied ?? false
      ),
      updateCommandEnabled,
      selectDirectory: selectCommandDirectory,
      setSearchScope: (searchMode) => updateSkimDisplay({ ...skimDisplay, searchMode }, false),
      setSkimScope: (mode) => updateSkimDisplay({ ...skimDisplay, mode }, false),
      setSkimHiddenFiles: (showHiddenFiles) => updateSkimDisplay({ ...skimDisplay, showHiddenFiles }, false),
      setSkimSortDirection: (sortDirection) => updateSkimSort({ ...search, ...skimSortPreference, sortDirection }, false),
      setSkimSortField: (sortField) => updateSkimSort({ ...search, ...skimSortPreference, sortField }, false),
      setCurrentAiSearch: setCommandAiSearch,
      setShellMode: setCommandShellMode,
      resetWindow: resetCommandWindow,
      maximizeWindow: maximizeCommandWindow,
      setAlwaysOnTop: setCommandAlwaysOnTop,
      setSortDirection: (sortDirection) => updateResultsSearch({ ...getCommandBaseSearch(), sortDirection }, true),
      setSortField: (sortField) => updateResultsSearch({ ...getCommandBaseSearch(), sortField }, true),
      addDirectory: addCommandDirectory,
      refreshDirectoryStatus: refreshCommandDirectoryStatus,
      refreshLlamaRuntimes: refreshCommandLlamaRuntimes,
      startLlamaRuntime: startCommandLlamaRuntime,
      selectLlamaRuntime: selectCommandLlamaRuntime,
      refreshVisionModels: refreshCommandVisionModels,
      selectVisionModel: selectCommandVisionModel,
      directoryExists: (directoryName) => findDirectoryByCommandName(directoryName) !== undefined,
      deleteDirectory: deleteCommandDirectory,
      renameDirectory: renameCommandDirectory,
      getLlamaStopBlocker: getCommandLlamaStopBlocker,
      stopLlamaRuntime: stopCommandLlamaRuntime,
      clearCache: clearCommandCache,
      clearThumbnailCache: () => clearCommandCache("thumbnails"),
      clearSkimCache: clearCommandSkimCache,
      quitApp: quitCommandApp
    }).then((result) => {
      showQuickCommandNotice(result.message, result.status === "confirmation");
      if (result.status === "confirmation") {
        setPendingQuickCommandConfirmation(result.confirmation);
      }
      setSearch((currentSearch) => ({ ...currentSearch, query: "" }));
    });
    return true;
  };

  const submitSearch = (nextSearch = search) => {
    const directoryPathResolutionRequest = ++directoryPathResolutionRequestRef.current;
    const invocation = parseAssistantInvocation(nextSearch.query);
    const submittedSearch = invocation.requested ? { ...nextSearch, query: invocation.query } : nextSearch;
    const aiRequested = invocation.requested && aiRecognitionEnabled;
    if (invocation.requested && !aiRecognitionEnabled) showQuickCommandNotice(t("search.aiRecognitionDisabled"));
    if (aiRequested) aiSearchBeta.activate();
    if (!invocation.requested && submitQuickCommandIfNeeded(submittedSearch)) {
      return;
    }

    const directoryInput = invocation.requested ? null : getAbsoluteWindowsDirectoryInput(submittedSearch.query);
    if (directoryInput) {
      void window.cap7ce?.skim.resolveDirectoryPath(directoryInput).then((resolvedPath) => {
        if (directoryPathResolutionRequestRef.current !== directoryPathResolutionRequest) return;
        if (!resolvedPath) {
          showQuickCommandNotice(t("skim.directoryUnavailable"));
          return;
        }
        clearQuickCommandNotice();
        setSearch({ ...submittedSearch, query: "" });
        openSkimAtLocation(resolvedPath);
      }).catch(() => {
        if (directoryPathResolutionRequestRef.current === directoryPathResolutionRequest) {
          showQuickCommandNotice(t("skim.directoryUnavailable"));
        }
      });
      return;
    }

    setSearch(submittedSearch);
    aiSearchBeta.cancelActive();
    void runSearch(submittedSearch, { aiEnhanced: aiRequested || (aiRecognitionEnabled && aiSearchBeta.enabled) });
  };

  useSearchIndexRefresh((force) => {
    if (!resultsInitializedRef.current || (!force && !lastResultSearchRef.current.query.trim())) return;
    void runSearch(lastResultSearchRef.current, { navigate: false, preserveAiResults: true });
  });

  const openResults = () => {
    submitSearch(search);
  };

  const collapseShellToStandby = enterStandby;
  const refreshDirectories = (nextDirectories: DirectoryItem[]) => {
    setDirectories(nextDirectories);
    setDirectoryServiceUnavailable(false);
    setSearch((current) => {
      if (current.directoryId === "all" || nextDirectories.some((directory) => directory.id === current.directoryId)) {
        return current;
      }
      return { ...current, directoryId: "all" };
    });
  };

  const refreshDefaultDirectoryResults = async () => {
    if (
      search.query.trim().length > 0
      || search.directoryId !== "all"
      || search.fileFormat !== "all"
    ) {
      return;
    }

    const nextSearch = { ...search, query: "", directoryId: "all", fileFormat: "all" };
    setSearch(nextSearch);
    await runSearch(nextSearch, { navigate: false });
  };

  const applyDirectoryAddResult = async (result: DirectoryAddResult, showFeedback = true) => {
    refreshDirectories(result.directories);
    setDirectoryServiceUnavailable(false);
    if (result.added.length > 0) {
      const countedDirectories = await window.cap7ce?.directories.refreshFileCounts(result.added.map((directory) => directory.id));
      if (countedDirectories) refreshDirectories(countedDirectories);
      await refreshDefaultDirectoryResults();
    }
    if (showFeedback) {
      const message = formatDirectoryAddFeedback(result);
      if (message) {
        showQuickCommandNotice(message);
      }
    }
  };

  const addDirectory = async () => {
    if (isAddingDirectory) {
      return;
    }
    setIsAddingDirectory(true);
    directoryAddFeedbackTargetRef.current = "search";
    try {
      const result = await window.cap7ce?.directories.selectAndAdd();
      if (!result) {
        setDirectoryServiceUnavailable(true);
        return;
      }
      await applyDirectoryAddResult(result, result.conflicts.length === 0);
      if (result.conflicts.length > 0) {
        setPendingDirectoryAddResult(result);
        setDialog("replaceDirectories");
      }
    } catch {
      setDirectoryServiceUnavailable(true);
    } finally {
      setIsAddingDirectory(false);
    }
  };

  const addSkimEntries = async (entries: SkimBrowseEntry[]) => {
    if (isAddingDirectory || entries.length === 0) return;
    setIsAddingDirectory(true);
    directoryAddFeedbackTargetRef.current = "skim";
    try {
      const result = await window.cap7ce?.directories.addCandidates({
        candidates: entries.map((entry) => entry.path)
      });
      if (!result) {
        showSkimFeedback(t("directoryAdd.noChanges"));
        return;
      }
      await applyDirectoryAddResult(result, false);
      const message = formatDirectoryAddFeedback(result);
      if (message) showSkimFeedback(message);
      if (result.conflicts.length > 0) {
        setPendingDirectoryAddResult(result);
        setDialog("replaceDirectories");
      }
    } catch (error) {
      showSkimFeedback(formatDisplayMessage(error instanceof Error ? error.message : t("directoryAdd.noChanges")));
    } finally {
      setIsAddingDirectory(false);
    }
  };

  useSettingsDataSynchronization({ setTheme, setLanguagePreference, setResolvedLanguage, setAppearanceColors, setUiFontSize, setWindowMaterial, setStandbyLineVisible, setLaunchAtLogin, setSystemNotificationsEnabled, setOperationHintsEnabled, setAiRecognitionEnabled, setQuickActionGlobalEnabled, setCommandEnabled, setShortcutActions, setSearchLabelVisibility, setSkimDisplay, setSkimSidebarFolders, setSkimSystemLocationsCollapsed, refreshDirectories });

  const saveSkimSidebarFolders = useCallback(async (nextFolders: string[]) => {
    try {
      const preferences = await window.cap7ce?.preferences.updateSkimSidebarFolders(nextFolders);
      if (!preferences) return false;
      setSkimSidebarFolders(preferences.skimSidebarFolders);
      const nextLocations = await window.cap7ce?.skim.listLocations();
      if (nextLocations?.length) setSkimLocations(nextLocations);
      return true;
    } catch (error) {
      const message = formatDisplayMessage(error instanceof Error ? error.message : t("skim.sidebar.updateFailed"));
      showSkimFeedback(message);
      return false;
    }
  }, [showSkimFeedback]);

  const addSkimSidebarFolders = useCallback(async (folderPaths: string[]) => {
    const existingKeys = new Set(skimSidebarFolders.map(normalizeWindowsPathKey));
    const missingFolders = folderPaths.filter((folderPath) => !existingKeys.has(normalizeWindowsPathKey(folderPath)));
    if (missingFolders.length === 0) return;
    if (await saveSkimSidebarFolders([...skimSidebarFolders, ...missingFolders])) {
      showSkimFeedback(t("skim.sidebar.starredFeedback"));
    }
  }, [saveSkimSidebarFolders, showSkimFeedback, skimSidebarFolders]);

  const removeSkimSidebarFolders = useCallback(async (folderPaths: string[]) => {
    const removedKeys = new Set(folderPaths.map(normalizeWindowsPathKey));
    const nextFolders = skimSidebarFolders.filter((candidate) => !removedKeys.has(normalizeWindowsPathKey(candidate)));
    if (nextFolders.length === skimSidebarFolders.length) return;
    if (await saveSkimSidebarFolders(nextFolders)) {
      showSkimFeedback(t("skim.sidebar.unstarredFeedback"));
    }
  }, [saveSkimSidebarFolders, showSkimFeedback, skimSidebarFolders]);

  const toggleSkimSystemLocations = useCallback(async () => {
    const nextCollapsed = !skimSystemLocationsCollapsed;
    setSkimSystemLocationsCollapsed(nextCollapsed);
    try {
      const preferences = await window.cap7ce?.preferences.updateSkimSystemLocationsCollapsed(nextCollapsed);
      if (preferences) setSkimSystemLocationsCollapsed(preferences.skimSystemLocationsCollapsed);
    } catch {
      setSkimSystemLocationsCollapsed(!nextCollapsed);
    }
  }, [skimSystemLocationsCollapsed]);

  const cancelDroppedDirectoryAdd = () => {
    if (isAddingDirectory) return;
    setDroppedDirectories([]);
    setDialog(null);
    directoryAddFeedbackTargetRef.current = "search";
  };

  const confirmDroppedDirectoryAdd = async () => {
    if (isAddingDirectory || droppedDirectories.length === 0) return;
    setIsAddingDirectory(true);
    try {
      const result = await window.cap7ce?.directories.addCandidates({
        candidates: droppedDirectories.map((directory) => directory.path)
      });
      if (!result) {
        setDirectoryServiceUnavailable(true);
        setDroppedDirectories([]);
        setDialog(null);
        directoryAddFeedbackTargetRef.current = "search";
        return;
      }
      await applyDirectoryAddResult(result, false);
      const message = formatDirectoryAddFeedback(result);
      if (message) {
        if (directoryAddFeedbackTargetRef.current === "skim") showSkimFeedback(message);
        else showQuickCommandNotice(message);
      }
      setDroppedDirectories([]);
      if (result.conflicts.length > 0) {
        setPendingDirectoryAddResult(result);
        setDialog("replaceDirectories");
      } else {
        setDialog(null);
        directoryAddFeedbackTargetRef.current = "search";
      }
    } catch (error) {
      const message = formatDisplayMessage(error instanceof Error ? error.message : t("directoryAdd.noChanges"));
      if (directoryAddFeedbackTargetRef.current === "skim") showSkimFeedback(message);
      else showQuickCommandNotice(message);
      setDirectoryServiceUnavailable(true);
      setDroppedDirectories([]);
      setDialog(null);
      directoryAddFeedbackTargetRef.current = "search";
    } finally {
      setIsAddingDirectory(false);
    }
  };

  const confirmDirectoryReplacement = async () => {
    if (!pendingDirectoryAddResult || isAddingDirectory) {
      return;
    }
    setIsAddingDirectory(true);
    try {
      const result = await window.cap7ce?.directories.addCandidates({
        candidates: pendingDirectoryAddResult.conflicts.map((conflict) => conflict.candidatePath),
        conflictResolution: "replace-existing"
      });
      if (!result) {
        setDirectoryServiceUnavailable(true);
        return;
      }
      await applyDirectoryAddResult(result, false);
      const message = formatDirectoryAddFeedback(result);
      if (message) {
        if (directoryAddFeedbackTargetRef.current === "skim") showSkimFeedback(message);
        else showQuickCommandNotice(message);
      }
      setPendingDirectoryAddResult(null);
      setDialog(null);
      directoryAddFeedbackTargetRef.current = "search";
    } catch {
      setDirectoryServiceUnavailable(true);
    } finally {
      setIsAddingDirectory(false);
    }
  };

  const updateDirectoryName = async (id: string, name: string) => {
    const nextDirectories = await window.cap7ce?.directories.updateName(id, name);
    if (nextDirectories) {
      refreshDirectories(nextDirectories);
    }
    setEditingDirectoryId(null);
  };

  const deleteDirectoryById = async (directoryId: string) => {
    const deletedDirectories = await window.cap7ce?.directories.delete(directoryId);
    const reloadedDirectories = await window.cap7ce?.directories.list();
    const nextDirectories = reloadedDirectories ?? deletedDirectories;
    if (nextDirectories) refreshDirectories(nextDirectories);
    await refreshVisualCacheStats();

    const nextSearch = search.directoryId === directoryId
      ? { ...search, directoryId: "all" }
      : search;
    setSearch(nextSearch);
    if (resultsInitializedRef.current) {
      await runSearch(nextSearch, { navigate: false });
    }
  };

  const confirmDeleteDirectory = async () => {
    if (!directoryToDelete || directoryDeleteInFlightRef.current) return;
    directoryDeleteInFlightRef.current = true;
    try {
      await deleteDirectoryById(directoryToDelete);
      setDirectoryToDelete(null);
      setDialog(null);
    } finally {
      directoryDeleteInFlightRef.current = false;
    }
  };

  const invokeFileAction = async (
    action: "open" | "showInFolder",
    item: ImageIndexItem
  ) => {
    setContextMenu(null);
    await window.cap7ce?.files[action](item.filePath);
  };

  const requestDeleteFiles = (items: ImageIndexItem[]) => {
    setContextMenu(null);
    if (items.length === 0) return;
    setFilesPendingDelete(items.map((item) => ({ ...item, keywords: [...item.keywords] })));
    setDeleteFilesFeedback(null);
    setDialog("deleteFiles");
  };

  const captureKeywordEditScrollSnapshot = () => {
    if (shellState !== "normal") {
      keywordEditScrollSnapshotRef.current = null;
      return;
    }

    const scrollContainer = document.querySelector<HTMLElement>(".cap-results-view .image-grid");
    const offset = scrollContainer
      ? scrollContainer.scrollTop
      : resultScrollMemoryRef.current.offset;
    const scrollMemory = {
      ...resultScrollMemoryRef.current,
      layoutMode: getResultLayoutMode(shellState),
      offset
    };
    resultScrollMemoryRef.current = scrollMemory;
    keywordEditScrollSnapshotRef.current = {
      scrollMemory,
      shellState,
      search: { ...search }
    };
  };

  const restoreKeywordEditScrollSnapshot = () => {
    const snapshot = keywordEditScrollSnapshotRef.current;
    keywordEditScrollSnapshotRef.current = null;
    if (!snapshot || snapshot.shellState !== shellState) return;

    const searchUnchanged = snapshot.search.query === search.query
      && snapshot.search.directoryId === search.directoryId
      && snapshot.search.sortField === search.sortField
      && snapshot.search.sortDirection === search.sortDirection;
    if (searchUnchanged) {
      resultScrollMemoryRef.current = snapshot.scrollMemory;
    }
  };

  const requestEditKeywords = (items: ImageIndexItem[]) => {
    if (items.length === 0) {
      return;
    }
    captureKeywordEditScrollSnapshot();
    if (keywordEditorExitTimerRef.current !== null) {
      window.clearTimeout(keywordEditorExitTimerRef.current);
      keywordEditorExitTimerRef.current = null;
    }
    keywordEditorClosingRef.current = false;
    setIsKeywordEditorClosing(false);
    setContextMenu(null);
    const frozenItems = items.map((item) => ({ ...item, keywords: [...item.keywords] }));
    const mode = frozenItems.length === 1 ? "single" : "multi";
    const initialCommonKeywords = mode === "single"
      ? [...frozenItems[0].keywords]
      : getCommonKeywords(frozenItems);
    setKeywordEditSession({
      mode,
      items: frozenItems,
      initialCommonKeywords
    });
    setEditKeywords(initialCommonKeywords.join(","));
    setEditMetadataError("");
    setDialog("editKeywords");
  };

  useEffect(() => {
    const unsubscribe = window.cap7ce?.preview.onItemAction((request) => {
      const item = searchResults.find((candidate) => (
        candidate.id === request.itemId
        && candidate.filePath.toLowerCase() === request.filePath.toLowerCase()
      ));
      if (!item) {
        showQuickCommandNotice(t("search.fileMissing"));
        return;
      }
      if (request.action === "editKeywords") {
        requestEditKeywords([item]);
        return;
      }
      requestDeleteFiles([item]);
    });
    return () => unsubscribe?.();
  }, [searchResults, showQuickCommandNotice]);

  const finishKeywordEditorClose = () => {
    if (!keywordEditorClosingRef.current) return;
    if (keywordEditorExitTimerRef.current !== null) {
      window.clearTimeout(keywordEditorExitTimerRef.current);
      keywordEditorExitTimerRef.current = null;
    }
    keywordEditorClosingRef.current = false;
    restoreKeywordEditScrollSnapshot();
    setDialog(null);
    setKeywordEditSession(null);
    setEditMetadataError("");
    setIsKeywordEditorClosing(false);
  };

  const beginKeywordEditorClose = () => {
    if (keywordEditorClosingRef.current) return;
    keywordEditorClosingRef.current = true;
    setIsKeywordEditorClosing(true);
    const exitDelay = getKeywordEditorExitDelay(
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    );
    keywordEditorExitTimerRef.current = window.setTimeout(finishKeywordEditorClose, exitDelay);
  };

  const cancelEditKeywords = () => {
    if (keywordSaveInFlightRef.current || keywordEditorClosingRef.current) return;
    showQuickCommandNotice(t("keywords.cancelled"));
    beginKeywordEditorClose();
  };

  const saveEditedKeywords = async () => {
    if (!keywordEditSession || keywordSaveInFlightRef.current) {
      return;
    }

    keywordSaveInFlightRef.current = true;
    setIsSavingMetadata(true);
    setEditMetadataError("");
    showQuickCommandNotice(t("common.saving"), true);
    try {
      if (keywordEditSession.mode === "single") {
        const updated = await window.cap7ce?.index.updateManualKeywords(
          keywordEditSession.items[0].filePath,
          editKeywords
        );
        if (!updated) {
          throw new Error(t("error.indexUnavailable"));
        }
      } else {
        const result = await window.cap7ce?.index.updateKeywordsBatch({
          targets: keywordEditSession.items.map((item) => ({ filePath: item.filePath })),
          initialCommonKeywords: keywordEditSession.initialCommonKeywords,
          targetKeywordText: editKeywords
        });
        if (!result) {
          throw new Error(t("error.indexUnavailable"));
        }
        if (!result.success) {
          clearQuickCommandNotice();
          setEditMetadataError(result.errorMessage || t("keywords.updateFailedCount", { count: result.failedCount }));
          return;
        }
      }
      await runSearch(search, { navigate: false });
      showQuickCommandNotice(t("keywords.saved"));
      beginKeywordEditorClose();
    } catch (error) {
      clearQuickCommandNotice();
      setEditMetadataError(error instanceof Error
        ? error.message
        : keywordEditSession.mode === "multi"
          ? t("error.batchKeywordFailed")
          : t("error.metadataSaveFailed"));
    } finally {
      keywordSaveInFlightRef.current = false;
      setIsSavingMetadata(false);
    }
  };

  const confirmDeleteFiles = async () => {
    if (filesPendingDelete.length === 0 || isDeletingFiles) {
      return;
    }

    const pendingItems = filesPendingDelete;
    const isRetry = deleteFilesFeedback?.status === "failed";
    setIsDeletingFiles(true);
    try {
      const requestedPaths = pendingItems.map((item) => item.filePath);
      if (import.meta.env.DEV) {
        console.debug("[file-delete:renderer] request", { requestedPaths });
      }
      const result = await window.cap7ce?.files.moveToTrash(
        requestedPaths
      );
      if (!result) {
        throw new Error(t("error.fileOperationUnavailable"));
      }
      if (import.meta.env.DEV) {
        console.debug("[file-delete:renderer] result", result);
      }

      const deletedPathKeys = new Set(result.deletedPaths.map((filePath) => filePath.toLowerCase()));
      const deletedItems = pendingItems.filter((item) => deletedPathKeys.has(item.filePath.toLowerCase()));
      const deletedImageIds = new Set(deletedItems.map((item) => item.id));
      setSearchResults((current) => current.filter(
        (item) => !deletedPathKeys.has(item.filePath.toLowerCase())
      ));
      setSelectedResultImageId((current) => (
        current && deletedImageIds.has(current) ? null : current
      ));
      void Promise.allSettled([
        refreshVisualCacheStats()
      ]).then((refreshResults) => {
        const refreshFailures = refreshResults.filter((refreshResult) => refreshResult.status === "rejected");
        if (refreshFailures.length === 0) return;
        console.warn("[file-delete:renderer] files were deleted, but state refresh failed", refreshFailures);
        showQuickCommandNotice(t("error.fileDeletedRefreshFailed"));
        void runSearch(search, { navigate: false });
      });

      if (result.failedItems.length > 0) {
        const failedPathKeys = new Set(result.failedItems.map((failure) => failure.path.toLowerCase()));
        const failedItems = pendingItems.filter((item) => failedPathKeys.has(item.filePath.toLowerCase()));
        setFilesPendingDelete(failedItems.length > 0 ? failedItems : pendingItems.filter(
          (item) => !deletedPathKeys.has(item.filePath.toLowerCase())
        ));
        setDeleteFilesFeedback({
          status: "failed",
          failedCount: result.failedItems.length,
          message: result.failedItems[0]?.error ?? t("error.partialDeleteFailed")
        });
      } else if (result.success) {
        setFilesPendingDelete([]);
        if (isRetry) {
          setDeleteFilesFeedback({ status: "succeeded", failedCount: 0, message: "" });
        } else {
          setDeleteFilesFeedback(null);
          setDialog(null);
        }
      } else {
        setDeleteFilesFeedback({
          status: "failed",
          failedCount: result.totalCount,
          message: t("error.deleteIncomplete")
        });
      }
    } catch (error) {
      setDeleteFilesFeedback({
        status: "failed",
        failedCount: pendingItems.length,
        message: error instanceof Error ? error.message : t("error.deleteFailed")
      });
    } finally {
      setIsDeletingFiles(false);
    }
  };

  const restoreViewAfterSkim = useCallback((nextView: Exclude<AppView, "skim">) => {
    const entries = navigationEntriesRef.current;
    const currentIndex = navigationIndexRef.current;
    const previousIndex = currentIndex - 1;
    if (
      entries[currentIndex] === "skim"
      && previousIndex >= 0
      && entries[previousIndex] === nextView
    ) {
      navigationIndexRef.current = previousIndex;
    } else {
      navigationEntriesRef.current = [nextView];
      navigationIndexRef.current = 0;
    }
    closeNavigationOverlays();
    setView(nextView);
  }, [closeNavigationOverlays]);

  const closeSkim = useCallback(() => {
    cancelSkimRead();
    void window.cap7ce?.preview.close();
    clearSkimFeedback();
    lastClosedSkimPathRef.current = skimCurrentPath;
    resetSkimLocation();
    skimForwardPathsRef.current = [];
    const returnContext = skimReturnContextRef.current;
    skimReturnContextRef.current = null;
    if (returnContext) {
      if (returnContext.shellState !== "normal") {
        setShellState(returnContext.shellState);
      }
      if (returnContext.view === "results" && !resultsInitializedRef.current) {
        openResults();
        return;
      }
      restoreViewAfterSkim(returnContext.view);
      return;
    }
    if (!resultsInitializedRef.current) {
      openResults();
      return;
    }
    restoreViewAfterSkim("results");
    if (shellState !== "normal") {
      setShellState("normal");
    }
  }, [cancelSkimRead, clearSkimFeedback, openResults, resetSkimLocation, restoreViewAfterSkim, shellState, skimCurrentPath]);

  const openSkimAtLocation = useCallback((nextPath: string | null) => {
    if (view === "skim") {
      void loadSkimLocation(nextPath).then((loaded) => {
        if (loaded) skimForwardPathsRef.current = [];
      });
      return;
    }
    const returnView: Exclude<AppView, "skim"> = view === "home" ? "results" : view;
    const returnShellState = shellState === "standby"
      ? "normal"
      : shellState;
    skimReturnContextRef.current = { view: returnView, shellState: returnShellState };
    resetSkimLocation();
    skimForwardPathsRef.current = [];
    if (shellState !== "normal") {
      setShellState("normal");
    }
    navigateTo("skim");
    void loadSkimLocation(nextPath);
  }, [loadSkimLocation, navigateTo, resetSkimLocation, shellState, view]);

  const openSkim = useCallback(() => {
    if (view === "skim") {
      if (shellState === "standby") {
        setShellState("normal");
      }
      return;
    }
    openSkimAtLocation(null);
  }, [openSkimAtLocation, shellState, view]);

  const navigateSkimParent = useCallback((closeAtRoot: boolean) => {
    if (skimCurrentPath === null) {
      if (closeAtRoot) closeSkim();
      return;
    }
    const parentBreadcrumb = skimBreadcrumbs.length > 1
      ? skimBreadcrumbs[skimBreadcrumbs.length - 2]
      : null;
    const currentPath = skimCurrentPath;
    void loadSkimLocation(parentBreadcrumb?.path ?? null).then((loaded) => {
      if (loaded) skimForwardPathsRef.current.push(currentPath);
    });
  }, [closeSkim, loadSkimLocation, skimBreadcrumbs, skimCurrentPath]);
  const navigateSkimBack = useCallback(() => navigateSkimParent(true), [navigateSkimParent]);

  const navigateSkimForward = useCallback(() => {
    const nextPath = skimForwardPathsRef.current[skimForwardPathsRef.current.length - 1];
    if (!nextPath) return;
    void loadSkimLocation(nextPath).then((loaded) => {
      if (loaded && skimForwardPathsRef.current[skimForwardPathsRef.current.length - 1] === nextPath) {
        skimForwardPathsRef.current.pop();
      }
    });
  }, [loadSkimLocation]);

  const openSettingsWindow = useCallback(() => {
    void window.cap7ce?.settingsWindow.open();
  }, []);

  useEffect(() => {
    const unsubscribe = window.cap7ce?.window.onToggleSkimLocationPickerRequested?.(() => {
      if (dialog === "editKeywords" || isAddingDirectory) return;
      setStableSkimToggleRequestId((requestId) => requestId + 1);
    });
    return () => unsubscribe?.();
  }, [dialog, isAddingDirectory]);

  useEffect(() => {
    const unsubscribe = window.cap7ce?.window.onActivateSkimRequested?.(() => {
      if (dialog === "editKeywords") return;
      setStableSkimToggleRequestId((requestId) => requestId + 1);
    });
    return () => unsubscribe?.();
  }, [dialog]);

  const refreshCurrentPage = async () => {
    if (
      shellState === "standby"
      || dialog
      || contextMenu
      || editingDirectoryId
      || pendingQuickCommandConfirmation
      || isAddingDirectory
      || isDeletingFiles
      || isSavingMetadata
    ) {
      return;
    }

    if (view === "skim") {
      await loadSkimLocation(skimCurrentPath);
      return;
    }

    if (view === "settings") {
      const directoryIds = directories.map((directory) => directory.id);
      const countedDirectories = directoryIds.length > 0
        ? await window.cap7ce?.directories.refreshFileCounts(directoryIds)
        : undefined;
      if (countedDirectories) refreshDirectories(countedDirectories);
      await Promise.all([
        refreshVisualCacheStats(),
        refreshLlamaRuntimeSettings(),
        refreshGgufModelSettings()
      ]);
      return;
    }

    if (view === "home" || view === "results") {
      const directoryIds = search.directoryId === "all"
        ? directories.map((directory) => directory.id)
        : [search.directoryId];
      const countedDirectories = directoryIds.length > 0
        ? await window.cap7ce?.directories.refreshFileCounts(directoryIds)
        : undefined;
      if (countedDirectories) refreshDirectories(countedDirectories);
      await runSearch(search, { navigate: false });
    }
  };

  useEffect(() => {
    const preventSideButtonDefault = (event: MouseEvent) => {
      if (event.button === 3 || event.button === 4) {
        event.preventDefault();
      }
    };
    const handleSideButtonNavigation = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) {
        return;
      }

      event.preventDefault();
      if (dialog === "editKeywords") return;
      const targetsSkim = event.target instanceof Element
        && event.target.closest(".cap-stable-skim-slot") !== null;
      if (event.button === 3) {
        if (targetsSkim) {
          navigateStableSkimBack();
          return;
        }
        if (view === "skim") {
          navigateSkimBack();
          return;
        }
        navigateBack();
      } else if (targetsSkim) {
        navigateStableSkimForward();
      } else if (view === "skim") {
        navigateSkimForward();
      } else {
        const nextIndex = navigationIndexRef.current + 1;
        if (navigationEntriesRef.current[nextIndex] === "settings") {
          openSettingsWindow();
          return;
        }
        if (navigationEntriesRef.current[nextIndex] === "skim") {
          openSkimAtLocation(lastClosedSkimPathRef.current);
          return;
        }
        navigateForward();
      }
    };

    window.addEventListener("mousedown", preventSideButtonDefault, true);
    window.addEventListener("mouseup", handleSideButtonNavigation, true);
    window.addEventListener("auxclick", preventSideButtonDefault, true);
    return () => {
      window.removeEventListener("mousedown", preventSideButtonDefault, true);
      window.removeEventListener("mouseup", handleSideButtonNavigation, true);
      window.removeEventListener("auxclick", preventSideButtonDefault, true);
    };
  }, [dialog, navigateBack, navigateForward, navigateSkimBack, navigateSkimForward, navigateStableSkimBack, navigateStableSkimForward, openSettingsWindow, openSkimAtLocation, view]);

  useEffect(() => {
    const unsubscribe = window.cap7ce?.window.onFocusMainSearch?.(() => {
      window.setTimeout(() => {
        searchInputRef.current?.focus();
      }, 80);
    });

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const handleWindowShortcutKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === "F5") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) {
          void refreshCurrentPage().catch(() => {
            if (view === "skim") showSkimFeedback(t("error.refreshFailed"));
            else showQuickCommandNotice(t("error.refreshFailed"));
          });
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();

        if (pendingQuickCommandConfirmation) {
          setPendingQuickCommandConfirmation(null);
          setSearch((currentSearch) => ({ ...currentSearch, query: "" }));
          showQuickCommandNotice(t("command.cancelled"));
          return;
        }

        if (dialog === "editKeywords") {
          if (isSavingMetadata) return;
          cancelEditKeywords();
          return;
        }

        if (dialog) {
          if (
            isAddingDirectory || isDeletingFiles
            || directoryDeleteInFlightRef.current
            || deleteFilesFeedback?.status === "succeeded"
          ) return;
          dismissCancellableDialog(dialog === "replaceDirectories");
          return;
        }

        if (contextMenu) {
          closeNavigationOverlays();
          return;
        }

        if (editingDirectoryId) {
          setEditingDirectoryId(null);
          return;
        }

        if (view === "results" && selectedResultImageId) {
          setClearSelectionRequestId((requestId) => requestId + 1);
          return;
        }

        return;
      }

      if (pendingQuickCommandConfirmation) {
        return;
      }

      if (dialog === "editKeywords") {
        return;
      }

      const searchResultsVisible = true;
      if (
        quickActionGlobalEnabled
        && searchResultsVisible
        && !dialog
        && !contextMenu
        && !editingDirectoryId
        && matchesShortcutEvent(event, shortcutActions.cycleDirectory)
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) {
          cycleSearchDirectory();
        }
        return;
      }

    };

    window.addEventListener("keydown", handleWindowShortcutKeyDown);
    return () => window.removeEventListener("keydown", handleWindowShortcutKeyDown);
  }, [
    closeNavigationOverlays,
    collapseShellToStandby,
    contextMenu,
    cycleSearchDirectory,
    deleteFilesFeedback,
    dialog,
    directories,
    editingDirectoryId,
    isAddingDirectory,
    isDeletingFiles,
    isSavingMetadata,
    openSkim,
    openSettingsWindow,
    pendingQuickCommandConfirmation,
    quickActionGlobalEnabled,
    search,
    selectedResultImageId,
    showQuickCommandNotice,
    showSkimFeedback,
    shellState,
    skimCurrentPath,
    shortcutActions,
    view
  ]);

  const acceptsDirectoryDrop = dialog === null && !isAddingDirectory;
  const startDroppedDirectoryAdd = (dataTransfer: DataTransfer) => {
    if (internalNativeDragRef.current) {
      internalNativeDragRef.current = false;
      return;
    }
    if (!acceptsDirectoryDrop) return;
    const nextDroppedDirectories = readDroppedDirectories(dataTransfer);
    if (nextDroppedDirectories.length === 0) return;
    setContextMenu(null);
    setDroppedDirectories(nextDroppedDirectories);
    directoryAddFeedbackTargetRef.current = "search";
    setDialog("addDroppedDirectories");
  };

  const resultStatusNode = <ResultStatus resultCount={searchResults.length} totalFileCount={totalFileCount} hasActiveSearch={search.query.trim().length > 0 || search.directoryId !== "all" || search.fileFormat !== "all"} isSearching={isSearching || aiSearchBeta.busy} />;
  const createResultsViewProps = (): ResultsViewProps => ({
    images: searchResults,
    isSearching: isSearching || aiSearchBeta.busy,
    aiSearchPhase: aiSearchBeta.phase,
    aiSearchProgress: aiSearchBeta.progress,
    searchError,
    contextMenuTheme: effectiveTheme,
    appearanceColors,
    imageContextMenuOpen: contextMenu !== null,
    keywordEditorOpen: dialog === "editKeywords",
    selectedImageId: selectedResultImageId,
    clearSelectionRequestId,
    scrollMemory: resultScrollMemoryRef.current,
    onSelectedImageChange: setSelectedResultImageId,
    onScrollMemoryChange: (scrollMemory) => { resultScrollMemoryRef.current = scrollMemory; },
    onFeedback: showQuickCommandNotice,
    onEditKeywords: requestEditKeywords,
    onContextMenu: (event, item, selectedItems, preview) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ x: event.clientX, y: event.clientY, item, items: selectedItems, preview });
    },
    onContextMenuClose: closeContextMenu,
    onOpenImage: (item) => invokeFileAction("open", item),
    onShowInFolder: (item) => invokeFileAction("showInFolder", item),
    onDeleteItems: requestDeleteFiles,
    onAiSearchSectionToggle: () => aiSearchBeta.toggleCurrentSearch(lastResultSearchRef.current, searchResults)
  });
  const createSkimViewProps = (active = true): SkimViewProps => ({
    visualSessionId: skimVisualSessionId,
    entries: sortedSkimEntries, currentPath: skimCurrentPath,
    isLoading: isSkimLoading, theme: effectiveTheme, appearanceColors, active,
    isAddingDirectory, onOpenBreadcrumb: openStableSkimLocation,
    onOpenEntry: (entry) => { if (entry.kind === "drive" || entry.kind === "folder") openStableSkimLocation(entry.path); },
    onAddEntries: (entries) => void addSkimEntries(entries), sidebarFolderPaths: skimSidebarFolders,
    sidebarKnownPaths: skimLocations.flatMap((location) => location.path ? [location.path] : []),
    onAddSidebarFolders: (folderPaths) => void addSkimSidebarFolders(folderPaths),
    onRemoveSidebarFolders: (folderPaths) => void removeSkimSidebarFolders(folderPaths), rootLocations: skimLocations, systemLocationsCollapsed: skimSystemLocationsCollapsed, onToggleSystemLocations: () => void toggleSkimSystemLocations(),
    onFeedback: showSkimFeedback, onNativeDragStateChange: (dragActive) => { internalNativeDragRef.current = dragActive; }
  });
  const deleteFilesPanel = dialog === "deleteFiles" ? (
    <DeleteFilesPanel
      isDeleting={isDeletingFiles}
      fileCount={filesPendingDelete.length}
      feedback={deleteFilesFeedback}
      onConfirm={confirmDeleteFiles}
      onCancel={() => {
        if (deleteFilesFeedback?.status === "succeeded") return;
        setFilesPendingDelete([]); setDeleteFilesFeedback(null); setDialog(null);
      }}
      onComplete={() => { setFilesPendingDelete([]); setDeleteFilesFeedback(null); setDialog(null); }}
    />
  ) : null;
  const contextMenuLayer = contextMenu ? (
    <ResultsContextMenuLayer
      key={`${contextMenu.item.id}:${contextMenu.x}:${contextMenu.y}`}
      state={contextMenu}
      onClose={closeContextMenu}
      theme={effectiveTheme}
      menuStyle={contextMenuStyle}
      onOpen={(item) => void invokeFileAction("open", item)}
      onShowInFolder={(item) => void invokeFileAction("showInFolder", item)}
      onCopyPaths={(items) => { setContextMenu(null); void window.cap7ce?.files.copyPaths(items.map((item) => item.filePath)); }}
      onEditKeywords={requestEditKeywords}
      onDelete={requestDeleteFiles}
    />
  ) : null;
  const keywordEditorLayer = dialog === "editKeywords" && keywordEditSession ? (
    <KeywordEditorCard session={keywordEditSession} keywords={editKeywords} error={editMetadataError} isSaving={isSavingMetadata} isClosing={isKeywordEditorClosing} menuStyle={contextMenuStyle} theme={effectiveTheme} showBackdrop={false} onKeywordsChange={setEditKeywords} onSave={saveEditedKeywords} onCancel={cancelEditKeywords} onExitComplete={finishKeywordEditorClose} />
  ) : null;
  const droppedDirectoryPanel = dialog === "addDroppedDirectories" && droppedDirectories.length > 0 ? (
    <AddDroppedDirectoriesPanel directories={droppedDirectories} isAdding={isAddingDirectory} onConfirm={() => void confirmDroppedDirectoryAdd()} onCancel={cancelDroppedDirectoryAdd} />
  ) : null;
  const directoryDialogLayer = <>
    {droppedDirectoryPanel}
    {dialog === "deleteDirectory" && <DeleteDirectoryPanel onConfirm={confirmDeleteDirectory} onCancel={() => { setDirectoryToDelete(null); setDialog(null); }} />}
    {dialog === "replaceDirectories" && pendingDirectoryAddResult && (
      <ReplaceDirectoriesPanel conflictCount={pendingDirectoryAddResult.conflicts.length} replacedCount={pendingDirectoryAddResult.conflicts.reduce((count, conflict) => count + conflict.existingDirectories.length, 0)} isAdding={isAddingDirectory} onConfirm={confirmDirectoryReplacement} onCancel={() => {
        if (isAddingDirectory) return;
        setPendingDirectoryAddResult(null); setDialog(null);
        if (directoryAddFeedbackTargetRef.current === "skim") showSkimFeedback(t("command.cancelled"));
        else showQuickCommandNotice(t("command.cancelled"));
        directoryAddFeedbackTargetRef.current = "search";
      }} />
    )}
  </>;

  return (
      <StableUiRenderer
        theme={effectiveTheme}
        themeStyle={appThemeStyle} windowMaterial={windowMaterial}
        pinned={isAlwaysOnTop}
        pinLabel={isAlwaysOnTop ? t("window.unfix") : t("window.fix")}
        search={search}
        searchInputRef={searchInputRef}
        inputFeedback={searchInputFeedback}
        inputFeedbackIsGuide={operationHintVisible}
        resultStatus={resultStatusNode}
        resultContent={<ResultsView {...createResultsViewProps()} />}
        overlayContent={<>{contextMenuLayer}{keywordEditorLayer}{deleteFilesPanel}{directoryDialogLayer}</>}
        sidebar={{
          search, directories: directoryOptions,
          skimDisplayMode: skimDisplay.searchMode, aiSearchEnabled: aiSearchBeta.enabled, aiSearchBusy: aiSearchBeta.busy,
          isLoadingDirectories, isAddingDirectory, directoryServiceUnavailable, editingDirectoryId,
          onAiSearchToggle: toggleAiSearchBeta, onSearchOptionsChange: updateResultsSearchOptions,
          onSearchDisplayModeChange: (searchMode) => updateSkimDisplay({ ...skimDisplay, searchMode }),
          onAddDirectory: () => void addDirectory(),
          onEditDirectory: setEditingDirectoryId, onCancelDirectoryEdit: () => setEditingDirectoryId(null),
          onDirectoryNameChange: (id, name) => void updateDirectoryName(id, name),
          onDeleteDirectory: (id) => { setDirectoryToDelete(id); setDialog("deleteDirectory"); },
          onOpenSettings: () => void window.cap7ce?.settingsWindow.open()
        }}
        skim={{
          toggleRequestId: stableSkimToggleRequestId,
          currentPath: skimCurrentPath, breadcrumbs: skimBreadcrumbs, isLoading: isSkimLoading,
          feedback: skimFeedback, entryCount: sortedSkimEntries.length + (skimCurrentPath === null ? countSkimRootLocations(skimLocations) : 0), displayMode: skimDisplay.mode,
          sortField: skimSortPreference.sortField, sortDirection: skimSortPreference.sortDirection,
          renderContent: (active) => <SkimView {...createSkimViewProps(active)} />,
          onOpen: () => openStableSkimLocation(skimCurrentPath), onBack: navigateStableSkimBack,
          onOpenRoot: () => openStableSkimLocation(null), onOpenPath: openStableSkimLocation,
          onDisplayModeChange: (mode) => updateSkimDisplay({ ...skimDisplay, mode }),
          onSortChange: (sortField, sortDirection) => updateSkimSort({ ...search, sortField, sortDirection })
        }}
        directoryDropEnabled={acceptsDirectoryDrop}
        onTogglePinned={() => { void toggleAlwaysOnTop("stable-ui"); }}
        onSearchChange={(nextSearch) => { clearQuickCommandNotice(); updateResultsSearch(nextSearch); }}
        onSearchOptionsChange={updateResultsSearchOptions}
        onSearch={() => submitSearch(search)}
        onDirectoryDrop={startDroppedDirectoryAdd}
        onDismissOverlay={closeContextMenu}
      />
  );

};



export default App;
