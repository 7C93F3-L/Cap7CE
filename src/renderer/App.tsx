import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent } from "react";
import { defaultAppearanceColors, getTextColorForBackground, isHexColor } from "./appearance";
import { executeQuickCommand } from "./commandExecutor";
import type { QuickCommandConfirmationRequest } from "./commandExecutor";
import { parseQuickCommand } from "./commandParser";
import ImageContextMenu, { getImageContextMenuStyle, type ImageContextMenuGroup } from "./ImageContextMenu";
import SkimLocationPicker from "./SkimLocationPicker";
import {
  getKeywordEditorExitDelay,
} from "./keywordEditorInteraction";
import {
  AddDroppedDirectoriesPanel,
  ClearCachePanel,
  DeleteDirectoryPanel,
  DeleteFilesPanel,
  ReplaceDirectoriesPanel
} from "./dialogs/ConfirmationPanels";
import KeywordEditorCard from "./dialogs/KeywordEditorCard";
import type {
  CacheClearFeedback,
  DeleteFilesFeedback,
  DroppedDirectory,
  KeywordEditSession
} from "./dialogs/dialogTypes";
import { getCommonKeywords } from "./dialogs/keywordEditorModel";
import { normalizeWindowsPathKey } from "./filePath";
import { formatCacheSize, formatDisplayMessage } from "./formatting";
import { isEditableKeyboardTarget } from "./keyboardTarget";
import {
  Cap7CESearchCapsule,
  standardSearchLabelGroups,
  type SearchCapsuleLabelVisibility
} from "./search/Cap7CESearchCapsule";
import { HomeView } from "./search/HomeView";
import { SettingsView, type ScanSummary } from "./settings/SettingsView";
import {
  defaultShortcutActions,
  getShortcutFromKeyboardEvent,
  normalizeShortcutActions
} from "./shortcutActions";
import ResultStatus from "./results/ResultStatus";
import { ResultsView } from "./results/ResultsView";
import { SkimView } from "./skim/SkimView";
import WindowControlRail, { type WindowControlAction } from "./WindowControlRail";
import type {
  AiIndexProgress,
  AppView,
  AppearanceColors,
  DirectoryAddResult,
  DirectoryItem,
  GgufModelSettings,
  ImageIndexItem,
  ImageSearchResponse,
  IndexQualityStats,
  LanguagePreference,
  LlamaRuntimeProcessState,
  LlamaRuntimeSettings,
  RecognitionStatusFilter,
  ResolvedThemeMode,
  SearchState,
  ShortcutActionId,
  ShortcutActionPreferences,
  ShortcutActionsUpdateResult,
  SkimBreadcrumb,
  SkimBrowseEntry,
  SkimBrowseOptions,
  SkimDisplayPreferences,
  SkimLocationShortcut,
  SortDirection,
  SortField,
  ThumbnailOptimizationStatus,
  VisualCacheStats,
  ThemeMode
} from "../shared/types";
import { getActiveLanguage, resolveLanguagePreference, setActiveLanguage, t, type TranslationKey } from "../../electron/localization";
import { fileFormatCapabilities, skimDefaultFileExtensionSet, skimCuratedFileExtensionSet } from "../../electron/formatCapabilities";

const getAbsoluteWindowsDirectoryInput = (input: string): string | null => {
  let candidate = input.trim();
  if (candidate.length >= 2 && candidate.startsWith('"') && candidate.endsWith('"')) {
    candidate = candidate.slice(1, -1).trim();
  }
  if (/^[\\/]{2}[?.][\\/]/.test(candidate)) return null;
  if (/^[a-z]:[\\/]/i.test(candidate)) return candidate;
  if (/^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/.test(candidate)) return candidate;
  return null;
};

type ShellState = "standby" | "capsule" | "micro" | "mini" | "normal" | "settings";
type ShellTransition = {
  from: ShellState;
  to: ShellState;
};
type Cap7CEWindowBounds = { x: number; y: number; width: number; height: number };
type DialogName = "addDroppedDirectories" | "deleteDirectory" | "replaceDirectories" | "deleteFiles" | "editKeywords" | "clearCache" | "clearSkimCache" | null;
const readDroppedDirectories = (dataTransfer: DataTransfer): DroppedDirectory[] => {
  const directories: DroppedDirectory[] = [];
  const seenPaths = new Set<string>();
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== "file" || !item.webkitGetAsEntry()?.isDirectory) continue;
    const file = item.getAsFile();
    if (!file) continue;
    const filePath = window.imageEverything?.files.getPathForFile(file)?.trim() ?? "";
    const pathKey = filePath.toLocaleLowerCase();
    if (!filePath || seenPaths.has(pathKey)) continue;
    seenPaths.add(pathKey);
    directories.push({ name: file.name, path: filePath });
  }
  return directories;
};
type ImageContextMenuState = {
  x: number;
  y: number;
  item: ImageIndexItem;
  items: ImageIndexItem[];
  preview: () => void;
  shellState: ShellState;
};
type IndexTaskRequest =
  | { kind: "all" }
  | { kind: "directory"; directoryId: string }
  | { kind: "continue" };
type KeywordEditScrollSnapshot = {
  offset: number;
  shellState: Extract<ShellState, "micro" | "mini" | "normal">;
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
const getSearchDisplayExtensions = (display: SkimDisplayPreferences) => (
  display.searchMode === "all"
    ? [...skimCuratedFileExtensionSet]
    : display.searchMode === "custom"
      ? display.customExtensions
      : [...skimDefaultFileExtensionSet]
).filter((extension) => fileFormatCapabilities.some((capability) => capability.extension === extension && capability.canSearch));
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
const shellTransitionDurationMs = 560;
const DEBUG_WINDOW_BOUNDS = false;



const emptyIndexQualityStats: IndexQualityStats = {
  totalFiles: 0,
  recognizedFiles: 0,
  unrecognizedFiles: 0,
  totalVisualImages: 0,
  pendingVisualImages: 0
};

const emptyLlamaRuntimeSettings: LlamaRuntimeSettings = {
  versions: [],
  selectedVersion: "",
  status: "missing_root",
  runtimeRoot: "",
  configPath: ""
};

const emptyLlamaRuntimeProcessState: LlamaRuntimeProcessState = {
  status: "stopped",
  host: "127.0.0.1",
  port: null,
  selectedVersion: "",
  modelStatus: "unselected",
  selectedModelId: "",
  healthUrl: "",
  logPath: ""
};

const emptyGgufModelSettings: GgufModelSettings = {
  files: [],
  models: [],
  selectedModelId: "",
  status: "unselected",
  modelsRoot: "",
  configPath: ""
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

const emptySearchResponse: ImageSearchResponse = {
  images: [],
  availableFormats: [],
  unrecognizedCount: 0,
  skippedUnrecognizedCount: 0,
  failureStats: {
    parseFailures: 0,
    fileFailures: 0
  }
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
  sortField: "file_name",
  sortDirection: "desc",
  recognitionStatus: "all"
};

interface OperationHintDefinition {
  key: TranslationKey;
  shortcutActionId?: ShortcutActionId;
  requiresCommands?: boolean;
}

const initialOperationHintKey: TranslationKey = "search.guide.search";
const operationHintDefinitions: OperationHintDefinition[] = [
  { key: initialOperationHintKey },
  { key: "search.guide.showCurrent" },
  { key: "search.guide.activateCapsule", shortcutActionId: "activateCapsule" },
  { key: "search.guide.activateMicro", shortcutActionId: "activateMicro" },
  { key: "search.guide.activateMini", shortcutActionId: "activateMini" },
  { key: "search.guide.activateNormal", shortcutActionId: "activateNormal" },
  { key: "search.guide.activateLine", shortcutActionId: "activateStandby" },
  { key: "search.guide.activateSkim", shortcutActionId: "activateSkim" },
  { key: "search.guide.openSettings", shortcutActionId: "openSettings" },
  { key: "search.guide.preview" },
  { key: "search.guide.previewNavigate" },
  { key: "search.guide.previewContextMenu" },
  { key: "search.guide.multiSelect" },
  { key: "search.guide.batchActions" },
  { key: "search.guide.dragResult" },
  { key: "search.guide.labels" },
  { key: "search.guide.hideLabel" },
  { key: "search.guide.labelMenu" },
  { key: "search.guide.commandDark", requiresCommands: true },
  { key: "search.guide.viewCommands" },
  { key: "search.guide.editShortcuts" },
  { key: "search.guide.trayNormal" },
  { key: "search.guide.focusSearch" },
  { key: "search.guide.resultContextMenu" }
];

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

const App = () => {
  const [view, setView] = useState<AppView>("home");
  const navigationEntriesRef = useRef<AppView[]>(["home"]);
  const navigationIndexRef = useRef(0);
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>("system");
  const [, setResolvedLanguage] = useState(() => getActiveLanguage());
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() => (
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  ));
  const [appearanceColors, setAppearanceColors] = useState<AppearanceColors>(defaultAppearanceColors);
  const [edgeSnapEnabled, setEdgeSnapEnabled] = useState(true);
  const [standbyLineVisible, setStandbyLineVisible] = useState(true);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [systemNotificationsEnabled, setSystemNotificationsEnabled] = useState(true);
  const [operationHintsEnabled, setOperationHintsEnabled] = useState(true);
  const [quickActionGlobalEnabled, setQuickActionGlobalEnabled] = useState(true);
  const [commandEnabled, setCommandEnabled] = useState(true);
  const [shortcutActions, setShortcutActions] = useState<ShortcutActionPreferences>(defaultShortcutActions);
  const [unavailableShortcutActionIds, setUnavailableShortcutActionIds] = useState<ShortcutActionId[]>([]);
  const [quickActionsExpanded, setQuickActionsExpanded] = useState(false);
  const [quickCommandsExpanded, setQuickCommandsExpanded] = useState(false);
  const [skimDisplay, setSkimDisplay] = useState<SkimDisplayPreferences>(defaultSkimDisplayPreferences);
  const [skimSidebarFolders, setSkimSidebarFolders] = useState<string[]>([]);
  const [skimSystemLocationsCollapsed, setSkimSystemLocationsCollapsed] = useState(false);
  const [skimSortPreference, setSkimSortPreference] = useState(defaultSkimSortPreference);
  const [search, setSearch] = useState<SearchState>(emptySearch);
  const lastResultSearchRef = useRef<SearchState>(emptySearch);
  const [searchCapsuleLabelVisibility, setSearchCapsuleLabelVisibility] = useState<SearchCapsuleLabelVisibility>({
    directory: true,
    recognition: true,
    sort: true,
    format: true,
    skimDisplay: true
  });
  const [directories, setDirectories] = useState<DirectoryItem[]>([]);
  const [isLoadingDirectories, setIsLoadingDirectories] = useState(true);
  const [isAddingDirectory, setIsAddingDirectory] = useState(false);
  const [directoryServiceUnavailable, setDirectoryServiceUnavailable] = useState(false);
  const [skimEntries, setSkimEntries] = useState<SkimBrowseEntry[]>([]);
  const [skimCurrentPath, setSkimCurrentPath] = useState<string | null>(null);
  const [skimBreadcrumbs, setSkimBreadcrumbs] = useState<SkimBreadcrumb[]>([]);
  const skimBrowseOptions = useMemo<SkimBrowseOptions>(() => ({
    ...defaultSkimBrowseOptions,
    sortField: skimSortPreference.sortField === "modified_at" ? "modifiedAt" : "name",
    sortDirection: skimSortPreference.sortDirection
  }), [skimSortPreference]);
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
  const [isSkimLoading, setIsSkimLoading] = useState(false);
  const [skimFeedback, setSkimFeedback] = useState("");
  const [skimLocationPickerOpen, setSkimLocationPickerOpen] = useState(false);
  const [skimLocationPickerClosing, setSkimLocationPickerClosing] = useState(false);
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
  const [llamaRuntimeSettings, setLlamaRuntimeSettings] = useState<LlamaRuntimeSettings>(emptyLlamaRuntimeSettings);
  const [llamaRuntimeProcessState, setLlamaRuntimeProcessState] = useState<LlamaRuntimeProcessState>(emptyLlamaRuntimeProcessState);
  const [ggufModelSettings, setGgufModelSettings] = useState<GgufModelSettings>(emptyGgufModelSettings);
  const [isLoadingLlamaRuntime, setIsLoadingLlamaRuntime] = useState(false);
  const [isLoadingGgufModels, setIsLoadingGgufModels] = useState(false);
  const [isChangingLlamaRuntimeState, setIsChangingLlamaRuntimeState] = useState(false);
  const [visualCacheStats, setVisualCacheStats] = useState<VisualCacheStats>(emptyVisualCacheStats);
  const [skimCacheStats, setSkimCacheStats] = useState<VisualCacheStats>(emptyVisualCacheStats);
  const [thumbnailOptimizationStatus, setThumbnailOptimizationStatus] = useState<ThumbnailOptimizationStatus>(emptyThumbnailOptimizationStatus);
  const thumbnailOptimizationPhaseRef = useRef<ThumbnailOptimizationStatus["phase"]>(emptyThumbnailOptimizationStatus.phase);
  const thumbnailOptimizationStatsTimerRef = useRef<number | null>(null);
  const [isLoadingCacheStats, setIsLoadingCacheStats] = useState(true);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheClearToken, setCacheClearToken] = useState<string | null>(null);
  const [cacheClearFeedback, setCacheClearFeedback] = useState<CacheClearFeedback | null>(null);
  const [skimCacheClearToken, setSkimCacheClearToken] = useState<string | null>(null);
  const [skimCacheClearFeedback, setSkimCacheClearFeedback] = useState<CacheClearFeedback | null>(null);
  const [isClearingSkimCache, setIsClearingSkimCache] = useState(false);
  const [cacheInlineFeedback, setCacheInlineFeedback] = useState("");
  const [skimCacheInlineFeedback, setSkimCacheInlineFeedback] = useState("");
  const [contextMenu, setContextMenu] = useState<ImageContextMenuState | null>(null);
  const [shellState, setShellState] = useState<ShellState>("standby");
  const [shellTransition, setShellTransition] = useState<ShellTransition | null>(null);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [lastNormalBounds, setLastNormalBounds] = useState<Cap7CEWindowBounds | null>(null);
  const [shellViewportHeight, setShellViewportHeight] = useState(() => window.innerHeight);
  const [miniStandardHeight, setMiniStandardHeight] = useState<number | null>(null);
  const [filesPendingDelete, setFilesPendingDelete] = useState<ImageIndexItem[]>([]);
  const [isDeletingFiles, setIsDeletingFiles] = useState(false);
  const [deleteFilesFeedback, setDeleteFilesFeedback] = useState<DeleteFilesFeedback | null>(null);
  const [keywordEditSession, setKeywordEditSession] = useState<KeywordEditSession | null>(null);
  const [isKeywordEditorClosing, setIsKeywordEditorClosing] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const [editKeywords, setEditKeywords] = useState("");
  const [editMetadataError, setEditMetadataError] = useState("");
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const keywordSaveInFlightRef = useRef(false);
  const keywordEditorClosingRef = useRef(false);
  const keywordEditorExitTimerRef = useRef<number | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [scanError, setScanError] = useState("");
  const [aiProgress, setAiProgress] = useState<AiIndexProgress | null>(null);
  const [searchResults, setSearchResults] = useState<ImageIndexItem[]>([]);
  const [selectedResultImageId, setSelectedResultImageId] = useState<string | null>(null);
  const [clearSelectionRequestId, setClearSelectionRequestId] = useState(0);
  const [quickCommandNotice, setQuickCommandNotice] = useState("");
  const [operationHintKey, setOperationHintKey] = useState<TranslationKey>(initialOperationHintKey);
  const [pendingQuickCommandConfirmation, setPendingQuickCommandConfirmation] = useState<QuickCommandConfirmationRequest | null>(null);
  const resultScrollPositionsRef = useRef<Record<RecognitionStatusFilter, number>>({
    all: 0,
    recognized: 0,
    unrecognized: 0
  });
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [indexStats, setIndexStats] = useState<IndexQualityStats>(emptyIndexQualityStats);
  const [searchStatus, setSearchStatus] = useState<ImageSearchResponse>(emptySearchResponse);
  const [isContinuingRecognition, setIsContinuingRecognition] = useState(false);
  const [isCancellingRecognition, setIsCancellingRecognition] = useState(false);
  const quickCommandNoticeTimerRef = useRef<number | null>(null);
  const skimFeedbackTimerRef = useRef<number | null>(null);
  const skimLocationPickerCloseTimerRef = useRef<number | null>(null);
  const skimLocationPickerCloseActionRef = useRef<(() => void) | null>(null);
  const directoryPathResolutionRequestRef = useRef(0);
  const searchTaskIdRef = useRef<string | null>(null);
  const viewDisplaySearchTimerRef = useRef<number | null>(null);
  const skimTaskIdRef = useRef<string | null>(null);
  const skimVisualSessionIdRef = useRef<string | null>(null);
  const [skimVisualSessionId, setSkimVisualSessionId] = useState("");
  const skimReturnContextRef = useRef<SkimReturnContext | null>(null);
  const lastClosedSkimPathRef = useRef<string | null>(null);
  const skimForwardPathsRef = useRef<string[]>([]);
  const settingsOpenedFromSkimRef = useRef(false);
  const cacheInlineFeedbackTimerRef = useRef<number | null>(null);
  const skimCacheInlineFeedbackTimerRef = useRef<number | null>(null);
  const lastIndexTaskRequestRef = useRef<IndexTaskRequest | null>(null);
  const scanResultsRefreshedDuringTaskRef = useRef(false);
  const keywordEditScrollSnapshotRef = useRef<KeywordEditScrollSnapshot | null>(null);
  const capsuleInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const previousShellStateRef = useRef<ShellState>("standby");
  const previousOperationHintQueryRef = useRef("");
  const initialOperationHintShownRef = useRef(false);
  const capsuleComposingRef = useRef(false);
  const capsuleCompositionGuardUntilRef = useRef(0);
  const resultsInitializedRef = useRef(false);

  useEffect(() => () => {
    if (keywordEditorExitTimerRef.current !== null) {
      window.clearTimeout(keywordEditorExitTimerRef.current);
    }
    if (skimLocationPickerCloseTimerRef.current !== null) {
      window.clearTimeout(skimLocationPickerCloseTimerRef.current);
    }
  }, []);

  const directoryOptions = useMemo(() => [createAllDirectoriesOption(directories), ...directories], [directories]);
  const selectedDirectory = directoryOptions.find((directory) => directory.id === search.directoryId) ?? directoryOptions[0];
  const isIndexing = isScanning || isContinuingRecognition;
  const effectiveTheme: ResolvedThemeMode = theme === "system" ? systemTheme : theme;
  const appThemeStyle = {
    "--theme-color": appearanceColors.themeColor,
    "--accent-color": appearanceColors.accentColor,
    "--theme-on-color": getTextColorForBackground(appearanceColors.themeColor),
    "--accent-on-color": getTextColorForBackground(appearanceColors.accentColor)
  } as CSSProperties;
  const contextMenuStyle = getImageContextMenuStyle(effectiveTheme, appearanceColors);
  const selectRandomOperationHint = useCallback(() => {
    setOperationHintKey((currentKey) => {
      const availableHints = operationHintDefinitions.filter((hint) => {
        if (hint.requiresCommands && !commandEnabled) {
          return false;
        }
        if (!hint.shortcutActionId) {
          return true;
        }
        return quickActionGlobalEnabled && !unavailableShortcutActionIds.includes(hint.shortcutActionId);
      });
      const candidates = availableHints.filter((hint) => hint.key !== currentKey);
      const nextHints = candidates.length > 0 ? candidates : availableHints;
      return nextHints[Math.floor(Math.random() * nextHints.length)]?.key ?? initialOperationHintKey;
    });
  }, [commandEnabled, quickActionGlobalEnabled, unavailableShortcutActionIds]);
  const operationHintDefinition = operationHintDefinitions.find((hint) => hint.key === operationHintKey);
  const operationHint = operationHintsEnabled && search.query.length === 0
    ? t(operationHintKey, operationHintDefinition?.shortcutActionId
      ? { shortcut: shortcutActions[operationHintDefinition.shortcutActionId] }
      : {})
    : "";
  const searchInputFeedback = quickCommandNotice || operationHint;
  const operationHintVisible = quickCommandNotice.length === 0 && operationHint.length > 0;
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    if (shellState === "standby") {
      return;
    }
    if (!initialOperationHintShownRef.current) {
      initialOperationHintShownRef.current = true;
      return;
    }
    selectRandomOperationHint();
  }, [shellState]);

  useEffect(() => {
    const previousQuery = previousOperationHintQueryRef.current;
    previousOperationHintQueryRef.current = search.query;
    if (previousQuery.length > 0 && search.query.length === 0) {
      selectRandomOperationHint();
    }
  }, [search.query]);
  useEffect(() => {
    directoryPathResolutionRequestRef.current += 1;
  }, [search.query]);
  const clearQuickCommandNotice = useCallback(() => {
    if (quickCommandNoticeTimerRef.current !== null) {
      window.clearTimeout(quickCommandNoticeTimerRef.current);
      quickCommandNoticeTimerRef.current = null;
    }

    setQuickCommandNotice("");
  }, []);

  const showQuickCommandNotice = useCallback((message: string, persist = false) => {
    clearQuickCommandNotice();

    setQuickCommandNotice(message);
    if (persist) {
      return;
    }

    quickCommandNoticeTimerRef.current = window.setTimeout(() => {
      setQuickCommandNotice("");
      quickCommandNoticeTimerRef.current = null;
    }, 3600);
  }, [clearQuickCommandNotice]);
  const clearSkimFeedback = useCallback(() => {
    if (skimFeedbackTimerRef.current !== null) {
      window.clearTimeout(skimFeedbackTimerRef.current);
      skimFeedbackTimerRef.current = null;
    }
    setSkimFeedback("");
  }, []);
  const showSkimFeedback = useCallback((message: string) => {
    clearSkimFeedback();
    setSkimFeedback(message);
    skimFeedbackTimerRef.current = window.setTimeout(() => {
      setSkimFeedback("");
      skimFeedbackTimerRef.current = null;
    }, 3600);
  }, [clearSkimFeedback]);
  const cancelSearch = useCallback(() => {
    const taskId = searchTaskIdRef.current;
    searchTaskIdRef.current = null;
    if (taskId) {
      void window.imageEverything?.search.cancel(taskId);
    }
    setIsSearching(false);
  }, []);
  const cancelSkimRead = useCallback(() => {
    const taskId = skimTaskIdRef.current;
    skimTaskIdRef.current = null;
    if (taskId) {
      void window.imageEverything?.skim.cancel(taskId);
    }
    const visualSessionId = skimVisualSessionIdRef.current;
    skimVisualSessionIdRef.current = null;
    setSkimVisualSessionId("");
    if (visualSessionId) {
      void window.imageEverything?.skim.cancelVisualSession(visualSessionId);
    }
    setIsSkimLoading(false);
  }, []);
  const loadSkimLocation = useCallback(async (nextPath: string | null) => {
    const previousTaskId = skimTaskIdRef.current;
    if (previousTaskId) {
      void window.imageEverything?.skim.cancel(previousTaskId);
    }
    const previousVisualSessionId = skimVisualSessionIdRef.current;
    if (previousVisualSessionId) {
      void window.imageEverything?.skim.cancelVisualSession(previousVisualSessionId);
    }
    skimVisualSessionIdRef.current = null;
    setSkimVisualSessionId("");
    const taskId = window.crypto?.randomUUID?.() ?? `skim-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    skimTaskIdRef.current = taskId;
    await window.imageEverything?.skim.beginVisualSession(taskId);
    setIsSkimLoading(true);
    clearSkimFeedback();
    try {
      const response = await window.imageEverything?.skim.read({
        taskId,
        path: nextPath,
        options: skimBrowseOptions
      });
      if (!response || skimTaskIdRef.current !== taskId || response.taskId !== taskId || response.cancelled) {
        return false;
      }
      setSkimEntries(response.entries);
      setSkimCurrentPath(response.currentPath);
      setSkimBreadcrumbs(response.breadcrumbs);
      skimVisualSessionIdRef.current = taskId;
      setSkimVisualSessionId(taskId);
      return true;
    } catch (error) {
      if (skimTaskIdRef.current === taskId) {
        void window.imageEverything?.skim.cancelVisualSession(taskId);
        showSkimFeedback(formatDisplayMessage(error instanceof Error ? error.message : t("skim.readFailed")));
      }
      return false;
    } finally {
      if (skimTaskIdRef.current === taskId) {
        skimTaskIdRef.current = null;
        setIsSkimLoading(false);
      }
    }
  }, [clearSkimFeedback, showSkimFeedback, skimBrowseOptions]);
  const showCacheInlineFeedback = useCallback((message: string) => {
    if (cacheInlineFeedbackTimerRef.current !== null) {
      window.clearTimeout(cacheInlineFeedbackTimerRef.current);
    }
    setCacheInlineFeedback(message);
    cacheInlineFeedbackTimerRef.current = window.setTimeout(() => {
      setCacheInlineFeedback("");
      cacheInlineFeedbackTimerRef.current = null;
    }, 3600);
  }, []);
  const showSkimCacheInlineFeedback = useCallback((message: string) => {
    if (skimCacheInlineFeedbackTimerRef.current !== null) {
      window.clearTimeout(skimCacheInlineFeedbackTimerRef.current);
    }
    setSkimCacheInlineFeedback(message);
    skimCacheInlineFeedbackTimerRef.current = window.setTimeout(() => {
      setSkimCacheInlineFeedback("");
      skimCacheInlineFeedbackTimerRef.current = null;
    }, 3600);
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
  const syncAlwaysOnTop = useCallback(async () => {
    const alwaysOnTopState = await window.imageEverything?.window.getAlwaysOnTop();
    if (alwaysOnTopState) {
      setIsAlwaysOnTop(alwaysOnTopState.actual);
    }
  }, []);

  useEffect(() => {
    const refreshOptimizationCacheStats = () => {
      void window.imageEverything?.cache.stats().then((stats) => {
        if (stats) {
          setVisualCacheStats(stats);
        }
      });
    };

    const unsubscribe = window.imageEverything?.cache.onOptimizationStatusChanged((status) => {
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
    const previousShellState = previousShellStateRef.current;
    const preserveBounds = (
      (previousShellState === "normal" || previousShellState === "settings") &&
      (shellState === "normal" || shellState === "settings")
    );
    void window.imageEverything?.window.setShellState(
      shellState,
      preserveBounds ? { preserveBounds: true } : undefined
    ).then(() => {
      syncAlwaysOnTop();
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          void window.imageEverything?.window.revealAfterShellStateReady();
        });
      });
    });
  }, [shellState, syncAlwaysOnTop]);

  useEffect(() => {
    const previousShellState = previousShellStateRef.current;
    if (previousShellState === shellState) {
      return undefined;
    }

    previousShellStateRef.current = shellState;
    setShellTransition({ from: previousShellState, to: shellState });
    const timer = window.setTimeout(() => {
      setShellTransition((currentTransition) => (
        currentTransition?.from === previousShellState && currentTransition.to === shellState
          ? null
          : currentTransition
      ));
    }, shellTransitionDurationMs);

    return () => window.clearTimeout(timer);
  }, [shellState]);

  useEffect(() => {
    if (shellState !== "normal" && shellState !== "settings") {
      setIsMaximized(false);
    }
  }, [shellState]);

  useEffect(() => {
    const contentViewActive = (
      (view === "results" || view === "skim")
      && (shellState === "micro" || shellState === "mini" || shellState === "normal")
    );
    const syncContentActivity = () => {
      const active = contentViewActive && document.visibilityState === "visible" && document.hasFocus();
      void window.imageEverything?.cache.setContentViewActive(active);
      if (!active) cancelSearch();
    };

    syncContentActivity();
    window.addEventListener("focus", syncContentActivity);
    window.addEventListener("blur", syncContentActivity);
    document.addEventListener("visibilitychange", syncContentActivity);
    return () => {
      window.removeEventListener("focus", syncContentActivity);
      window.removeEventListener("blur", syncContentActivity);
      document.removeEventListener("visibilitychange", syncContentActivity);
    };
  }, [cancelSearch, shellState, view]);

  useEffect(() => {
    const resultGridMounted = view === "results"
      && (shellState === "micro" || shellState === "mini" || shellState === "normal");
    if (!resultGridMounted) {
      void window.imageEverything?.cache.discardQueuedInteractiveThumbnails();
    }
  }, [shellState, view]);

  useEffect(() => {
    const unsubscribe = window.imageEverything?.window.onShellStateChanged?.((nextShellState) => {
      if (nextShellState === "standby") {
        resetShellBehaviorState();
      }
      if (nextShellState === "micro" || nextShellState === "mini" || nextShellState === "normal") {
        setView((currentView) => {
          if (currentView !== "settings") {
            return currentView;
          }

          const entries = navigationEntriesRef.current;
          const previousIndex = Math.max(0, navigationIndexRef.current - 1);
          const previousView = entries[previousIndex] && entries[previousIndex] !== "settings"
            ? entries[previousIndex]
            : "results";
          navigationEntriesRef.current = entries.slice(0, previousIndex + 1);
          navigationIndexRef.current = previousIndex;
          return previousView;
        });
      }
      setShellState((currentShellState) => currentShellState === nextShellState ? currentShellState : nextShellState);
      void syncAlwaysOnTop();
    });
    return () => unsubscribe?.();
  }, [resetShellBehaviorState, syncAlwaysOnTop]);

  useEffect(() => {
    const unsubscribe = window.imageEverything?.window.onAlwaysOnTopChanged?.((enabled) => {
      setIsAlwaysOnTop(enabled);
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (shellState !== "capsule") {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      capsuleInputRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [shellState]);

  useEffect(() => {
    const syncShellViewportHeight = () => setShellViewportHeight(window.innerHeight);
    syncShellViewportHeight();
    window.addEventListener("resize", syncShellViewportHeight);

    const getShellLayoutMetrics = window.imageEverything?.window.getShellLayoutMetrics;
    if (getShellLayoutMetrics) {
      void getShellLayoutMetrics().then((metrics) => {
        if (Number.isFinite(metrics.miniStandardHeight)) {
          setMiniStandardHeight(metrics.miniStandardHeight);
        }
      });
    }

    return () => window.removeEventListener("resize", syncShellViewportHeight);
  }, []);

  const closeNavigationOverlays = useCallback(() => {
    setContextMenu(null);
    if (skimLocationPickerCloseTimerRef.current !== null) {
      window.clearTimeout(skimLocationPickerCloseTimerRef.current);
      skimLocationPickerCloseTimerRef.current = null;
    }
    skimLocationPickerCloseActionRef.current = null;
    setSkimLocationPickerOpen(false);
    setSkimLocationPickerClosing(false);
  }, []);

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

  const refreshIndexStats = async () => {
    const stats = await window.imageEverything?.index.qualityStats();
    if (stats) {
      setIndexStats(stats);
    }
  };

  const refreshLlamaRuntimeSettings = async () => {
    setIsLoadingLlamaRuntime(true);
    try {
      const [settings, processState] = await Promise.all([
        window.imageEverything?.llamaRuntime.settings(),
        window.imageEverything?.llamaRuntime.processState()
      ]);
      if (settings) {
        setLlamaRuntimeSettings(settings);
      }
      if (processState) {
        setLlamaRuntimeProcessState(processState);
      }
      return { settings: settings ?? null, processState: processState ?? null };
    } finally {
      setIsLoadingLlamaRuntime(false);
    }
  };

  const refreshGgufModelSettings = async () => {
    setIsLoadingGgufModels(true);
    try {
      const settings = await window.imageEverything?.ggufModels.settings();
      if (settings) {
        setGgufModelSettings(settings);
      }
      return settings ?? null;
    } finally {
      setIsLoadingGgufModels(false);
    }
  };

  const refreshVisualCacheStats = async () => {
    setIsLoadingCacheStats(true);
    try {
      const [stats, currentSkimCacheStats] = await Promise.all([
        window.imageEverything?.cache.stats(),
        window.imageEverything?.skimCache.stats()
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
        const loadedDirectories = (await window.imageEverything?.directories.list()) ?? [];
        const missingFileCountIds = loadedDirectories
          .filter((directory) => directory.fileCount === null)
          .map((directory) => directory.id);
        const stats = await window.imageEverything?.index.qualityStats();
        const cacheOptimizationStatus = await window.imageEverything?.cache.optimizationStatus();
        const preferences = await window.imageEverything?.preferences.get();
        const loadedSkimLocations = await window.imageEverything?.skim.listLocations();
        const shortcutAvailability = await window.imageEverything?.preferences.shortcutAvailability();
        if (isMounted) {
          setDirectories(loadedDirectories);
          if (missingFileCountIds.length > 0) {
            void window.imageEverything?.directories.refreshFileCounts(missingFileCountIds).then((countedDirectories) => {
              if (isMounted && countedDirectories) {
                setDirectories(countedDirectories);
                void refreshIndexStats();
              }
            }).catch(() => undefined);
          }
          setDirectoryServiceUnavailable(false);
          if (preferences) {
            const resolvedLanguage = resolveLanguagePreference(preferences.languagePreference, navigator.language);
            setActiveLanguage(resolvedLanguage);
            setLanguagePreference(preferences.languagePreference);
            setResolvedLanguage(resolvedLanguage);
            setTheme(preferences.themePreference);
            setAppearanceColors(normalizeAppearanceColors(preferences.appearanceColors));
            setEdgeSnapEnabled(preferences.edgeSnapEnabled);
            setIsAlwaysOnTop(preferences.alwaysOnTop);
            setStandbyLineVisible(preferences.standbyLineVisible);
            setLaunchAtLogin(preferences.launchAtLogin);
            setSystemNotificationsEnabled(preferences.systemNotificationsEnabled);
            setOperationHintsEnabled(preferences.operationHintsEnabled);
            setQuickActionGlobalEnabled(preferences.quickActionGlobalEnabled);
            setCommandEnabled(preferences.commandEnabled);
            setShortcutActions(normalizeShortcutActions(preferences.shortcutActions));
            setSearchCapsuleLabelVisibility(preferences.searchLabelVisibility);
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
          if (stats) {
            setIndexStats(stats);
          }
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

  useEffect(() => {
    return window.imageEverything?.llamaRuntime.onStatusChanged((state) => {
      setLlamaRuntimeProcessState(state);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = window.imageEverything?.scan.onAiProgress((progress) => {
      setAiProgress(progress);
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const unsubscribe = window.imageEverything?.preferences.onStandbyLineVisibleChanged?.((nextStandbyLineVisible) => {
      setStandbyLineVisible(nextStandbyLineVisible);
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const unsubscribe = window.imageEverything?.preferences.onEdgeSnapEnabledChanged?.((nextEdgeSnapEnabled) => {
      setEdgeSnapEnabled(nextEdgeSnapEnabled);
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const unsubscribe = window.imageEverything?.preferences.onLanguageChanged?.((nextLanguagePreference, nextResolvedLanguage) => {
      setActiveLanguage(nextResolvedLanguage);
      setLanguagePreference(nextLanguagePreference);
      setResolvedLanguage(nextResolvedLanguage);
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) {
      return undefined;
    }

    const updateSystemTheme = () => {
      setSystemTheme(query.matches ? "dark" : "light");
    };

    updateSystemTheme();
    query.addEventListener("change", updateSystemTheme);
    return () => query.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => () => {
    if (quickCommandNoticeTimerRef.current !== null) {
      window.clearTimeout(quickCommandNoticeTimerRef.current);
      quickCommandNoticeTimerRef.current = null;
    }
    if (cacheInlineFeedbackTimerRef.current !== null) {
      window.clearTimeout(cacheInlineFeedbackTimerRef.current);
      cacheInlineFeedbackTimerRef.current = null;
    }
    if (skimCacheInlineFeedbackTimerRef.current !== null) {
      window.clearTimeout(skimCacheInlineFeedbackTimerRef.current);
      skimCacheInlineFeedbackTimerRef.current = null;
    }
    if (skimFeedbackTimerRef.current !== null) {
      window.clearTimeout(skimFeedbackTimerRef.current);
      skimFeedbackTimerRef.current = null;
    }
    if (searchTaskIdRef.current) {
      void window.imageEverything?.search.cancel(searchTaskIdRef.current);
      searchTaskIdRef.current = null;
    }
    if (viewDisplaySearchTimerRef.current !== null) {
      window.clearTimeout(viewDisplaySearchTimerRef.current);
      viewDisplaySearchTimerRef.current = null;
    }
    if (skimTaskIdRef.current) {
      void window.imageEverything?.skim.cancel(skimTaskIdRef.current);
      skimTaskIdRef.current = null;
    }
    if (skimVisualSessionIdRef.current) {
      void window.imageEverything?.skim.cancelVisualSession(skimVisualSessionIdRef.current);
      skimVisualSessionIdRef.current = null;
    }
  }, []);

  const runSearch = async (
    nextSearch = search,
    options?: { navigate?: boolean; display?: SkimDisplayPreferences }
  ) => {
    if (viewDisplaySearchTimerRef.current !== null) {
      window.clearTimeout(viewDisplaySearchTimerRef.current);
      viewDisplaySearchTimerRef.current = null;
    }
    cancelSearch();
    const taskId = window.crypto?.randomUUID?.() ?? `search-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    searchTaskIdRef.current = taskId;
    setContextMenu(null);
    setQuickCommandNotice("");
    setIsSearching(true);
    setSearchError("");
    resultsInitializedRef.current = true;
    lastResultSearchRef.current = nextSearch;
    if (options?.navigate !== false) {
      navigateTo("results");
    }
    try {
      const searchRequest = {
        ...nextSearch,
        includedExtensions: getSearchDisplayExtensions(options?.display ?? skimDisplay)
      };
      let response = (await window.imageEverything?.search.images(searchRequest, taskId)) ?? emptySearchResponse;
      if (searchTaskIdRef.current !== taskId) return;
      if (
        !Array.isArray(response)
        && nextSearch.fileFormat !== "all"
        && !response.availableFormats.includes(nextSearch.fileFormat)
      ) {
        const fallbackSearch = { ...nextSearch, fileFormat: "all" };
        setSearch(fallbackSearch);
        lastResultSearchRef.current = fallbackSearch;
        response = (await window.imageEverything?.search.images({
          ...fallbackSearch,
          includedExtensions: searchRequest.includedExtensions
        }, taskId)) ?? emptySearchResponse;
        if (searchTaskIdRef.current !== taskId) return;
      }
      setSearchResults(Array.isArray(response) ? response : response.images);
      setSearchStatus(Array.isArray(response) ? emptySearchResponse : response);
    } catch {
      if (searchTaskIdRef.current !== taskId) return;
      setSearchResults([]);
      setSearchStatus(emptySearchResponse);
      setSearchError(t("search.failed"));
    } finally {
      if (searchTaskIdRef.current === taskId) {
        searchTaskIdRef.current = null;
        setIsSearching(false);
      }
    }
  };

  const updateResultsSearch = (nextSearch: SearchState, refresh = false) => {
    setSearch(nextSearch);
    if (nextSearch.sortField !== search.sortField || nextSearch.sortDirection !== search.sortDirection) {
      void window.imageEverything?.preferences.updateSort({
        sortField: nextSearch.sortField,
        sortDirection: nextSearch.sortDirection
      });
    }
    if (refresh) {
      void runSearch(nextSearch);
    }
  };

  const updateTheme = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    void window.imageEverything?.preferences.updateTheme(nextTheme);
  };

  const updateLanguage = async (nextLanguagePreference: LanguagePreference) => {
    const preferences = await window.imageEverything?.preferences.updateLanguage(nextLanguagePreference);
    const appliedPreference = preferences?.languagePreference ?? nextLanguagePreference;
    const resolvedLanguage = resolveLanguagePreference(appliedPreference, navigator.language);
    setActiveLanguage(resolvedLanguage);
    setLanguagePreference(appliedPreference);
    setResolvedLanguage(resolvedLanguage);
  };

  const updateAppearanceColors = (nextAppearanceColors: AppearanceColors) => {
    const normalizedColors = normalizeAppearanceColors(nextAppearanceColors);
    setAppearanceColors(normalizedColors);
    void window.imageEverything?.preferences.updateAppearanceColors(normalizedColors);
  };

  const showSortNotice = (sortField: SortField, sortDirection: SortDirection) => {
    const noticeKey: TranslationKey = sortField === "modified_at"
      ? (sortDirection === "desc" ? "search.sortSwitched.modifiedAtDesc" : "search.sortSwitched.modifiedAtAsc")
      : (sortDirection === "asc" ? "search.sortSwitched.fileNameAsc" : "search.sortSwitched.fileNameDesc");
    showQuickCommandNotice(t(noticeKey));
  };

  const updateSkimSort = (nextSearch: SearchState) => {
    const nextSkimSortPreference = {
      sortField: nextSearch.sortField,
      sortDirection: nextSearch.sortDirection
    };
    setSkimSortPreference(nextSkimSortPreference);
    void window.imageEverything?.preferences.updateSkimSort(nextSkimSortPreference);
    if (
      nextSkimSortPreference.sortField !== skimSortPreference.sortField
      || nextSkimSortPreference.sortDirection !== skimSortPreference.sortDirection
    ) {
      showSortNotice(nextSkimSortPreference.sortField, nextSkimSortPreference.sortDirection);
    }
  };

  const previewAppearanceColors = (nextAppearanceColors: AppearanceColors) => {
    setAppearanceColors(normalizeAppearanceColors(nextAppearanceColors));
  };

  const updateEdgeSnapEnabled = (nextEdgeSnapEnabled: boolean) => {
    setEdgeSnapEnabled(nextEdgeSnapEnabled);
    void window.imageEverything?.preferences.updateEdgeSnap(nextEdgeSnapEnabled);
  };

  const updateStandbyLineVisible = (nextStandbyLineVisible: boolean) => {
    setStandbyLineVisible(nextStandbyLineVisible);
    void window.imageEverything?.preferences.updateStandbyLineVisible(nextStandbyLineVisible);
  };

  const updateLaunchAtLogin = async (nextLaunchAtLogin: boolean) => {
    setLaunchAtLogin(nextLaunchAtLogin);
    const preferences = await window.imageEverything?.preferences.updateLaunchAtLogin(nextLaunchAtLogin);
    if (preferences) {
      setLaunchAtLogin(preferences.launchAtLogin);
    }
  };

  const updateOperationHints = async (enabled: boolean) => {
    setOperationHintsEnabled(enabled);
    const preferences = await window.imageEverything?.preferences.updateOperationHints(enabled);
    if (preferences) {
      setOperationHintsEnabled(preferences.operationHintsEnabled);
    }
  };

  const updateAutoCacheOptimization = async (enabled: boolean) => {
    const preferences = await window.imageEverything?.preferences.updateAutoCacheOptimization(enabled);
    const status = await window.imageEverything?.cache.optimizationStatus();
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

  const updateQuickActionGlobalEnabled = (nextQuickActionGlobalEnabled: boolean) => {
    if (!nextQuickActionGlobalEnabled) {
      setQuickActionGlobalEnabled(false);
    }
    return window.imageEverything?.preferences.updateQuickActionGlobalEnabled(nextQuickActionGlobalEnabled).then(async (preferences) => {
      const shortcutAvailability = await window.imageEverything?.preferences.shortcutAvailability();
      setUnavailableShortcutActionIds(shortcutAvailability?.unavailableActionIds ?? []);
      if (preferences) {
        setQuickActionGlobalEnabled(preferences.quickActionGlobalEnabled);
        return preferences.quickActionGlobalEnabled;
      }
      return false;
    }) ?? Promise.resolve(false);
  };

  const updateShortcutActions = async (nextShortcutActions: ShortcutActionPreferences): Promise<ShortcutActionsUpdateResult | null> => {
    const normalizedShortcutActions = normalizeShortcutActions(nextShortcutActions);
    try {
      const result = await window.imageEverything?.preferences.updateShortcutActions(normalizedShortcutActions);
      if (!result) {
        return null;
      }
      if (result.applied) {
        setShortcutActions(normalizeShortcutActions(result.preferences.shortcutActions));
        setUnavailableShortcutActionIds(result.unavailableActionIds);
      }
      return result;
    } catch {
      return null;
    }
  };

  const beginShortcutCapture = useCallback(async () => (
    await window.imageEverything?.preferences.beginShortcutCapture() ?? false
  ), []);

  const endShortcutCapture = useCallback(async () => {
    const availability = await window.imageEverything?.preferences.endShortcutCapture();
    setUnavailableShortcutActionIds(availability?.unavailableActionIds ?? []);
    const preferences = await window.imageEverything?.preferences.get();
    if (preferences) {
      setQuickActionGlobalEnabled(preferences.quickActionGlobalEnabled);
    }
    return availability ?? { unavailableActionIds: [] };
  }, []);

  const updateCommandEnabled = async (nextCommandEnabled: boolean) => {
    setCommandEnabled(nextCommandEnabled);
    const preferences = await window.imageEverything?.preferences.updateCommandEnabled(nextCommandEnabled);
    if (preferences) {
      setCommandEnabled(preferences.commandEnabled);
    }
  };

  const updateSearchCapsuleLabelVisibility = (nextVisibility: SearchCapsuleLabelVisibility) => {
    setSearchCapsuleLabelVisibility(nextVisibility);
    void window.imageEverything?.preferences.updateSearchLabelVisibility(nextVisibility);
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

  const showCommandResults = (nextSearch: SearchState, nextShellState: Exclude<ShellState, "standby" | "capsule" | "settings"> = "normal") => {
    resetSettingsViewState(true);
    setShellState(nextShellState);
    setSearch(nextSearch);
    void runSearch(nextSearch);
  };

  const showCommandDirectory = (directoryName: string) => {
    const directory = findDirectoryByCommandName(directoryName);
    if (!directory) {
      return false;
    }

    showCommandResults({
      ...getCommandBaseSearch(),
      query: "",
      directoryId: directory.id,
      recognitionStatus: "all"
    });
    return true;
  };

  const selectCommandDirectoryLabel = (directoryName: string) => {
    const directory = findDirectoryByCommandName(directoryName);
    if (!directory) {
      return false;
    }

    setSearchCapsuleLabelVisibility((currentVisibility) => {
      const nextVisibility = { ...currentVisibility, directory: true };
      void window.imageEverything?.preferences.updateSearchLabelVisibility(nextVisibility);
      return nextVisibility;
    });
    const nextSearch = { ...getCommandBaseSearch(), directoryId: directory.id };
    setSearch(nextSearch);
    void runSearch(nextSearch);
    return true;
  };

  const setCommandShellMode = (mode: "line" | "cap" | "micro" | "mini" | "normal") => {
    if (mode === "line") {
      resetShellBehaviorState();
      setShellState("standby");
      closeNavigationOverlays();
      return;
    }

    if (mode === "cap") {
      resetSettingsViewState(true);
      setShellState("capsule");
      return;
    }

    const preserveSkimView = view === "skim";
    if (!preserveSkimView) {
      resetSettingsViewState(true);
    }
    const nextShellState = mode;
    if (nextShellState === "micro") {
      void window.imageEverything?.window.setShellState("micro", { forceBounds: true });
    }
    setShellState(nextShellState);
    if (!preserveSkimView && !resultsInitializedRef.current) {
      const nextSearch = { ...getCommandBaseSearch(), query: "", recognitionStatus: "all" as const };
      setSearch(nextSearch);
      void runSearch(nextSearch);
    }
  };

  useEffect(() => {
    const unsubscribe = window.imageEverything?.window.onActivateShellModeShortcut?.((mode) => {
      setCommandShellMode(mode === "standby" ? "line" : mode === "capsule" ? "cap" : mode);
      if (mode === "standby" || dialog) return;
      window.setTimeout(() => searchInputRef.current?.focus({ preventScroll: true }), 80);
    });
    return () => unsubscribe?.();
  }, [dialog, setCommandShellMode]);

  const isRecognitionTaskRunning = () => (
    isScanning
    || isContinuingRecognition
    || aiProgress?.phase === "checking"
    || aiProgress?.phase === "processing"
  );

  const commandOperationFailed = (message: string) => ({ ok: false as const, message });

  const startCommandAllIndexes = async () => {
    if (isRecognitionTaskRunning()) {
      return commandOperationFailed(t("command.taskRunning"));
    }

    void scanAllDirectories();
    return { ok: true as const };
  };

  const startCommandDirectoryIndex = async (directoryName: string) => {
    if (isRecognitionTaskRunning()) {
      return commandOperationFailed(t("command.taskRunning"));
    }

    const directory = findDirectoryByCommandName(directoryName);
    if (!directory) {
      return commandOperationFailed(t("command.directoryNotFound"));
    }

    void scanDirectory(directory.id);
    return { ok: true as const };
  };

  const continueCommandIndexing = async () => {
    if (isRecognitionTaskRunning()) {
      return commandOperationFailed(t("command.taskRunning"));
    }

    void continueRecognition();
    return { ok: true as const };
  };

  const stopCommandIndexing = async () => {
    if (!isRecognitionTaskRunning()) {
      return commandOperationFailed(t("command.taskNotRunning"));
    }

    await cancelRecognition();
    return { ok: true as const };
  };

  const refreshCommandDirectoryStatus = async () => {
    try {
      const nextDirectories = await window.imageEverything?.directories.list();
      refreshDirectories(nextDirectories ?? []);
      await refreshIndexStats();
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
    if (isRecognitionTaskRunning()) {
      return commandOperationFailed(t("error.stopRecognitionFirst"));
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
    if (isRecognitionTaskRunning()) {
      return commandOperationFailed(t("error.stopRecognitionFirst"));
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
      const nextDirectories = await window.imageEverything?.directories.updateName(directory.id, normalizedNextName);
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
      if (shellState !== "normal" && shellState !== "settings") {
        resetSettingsViewState(true);
        const applied = await window.imageEverything?.window.setShellState("normal");
        if (applied === false) {
          return commandOperationFailed(t("error.normalWindowSwitchFailed"));
        }
        setShellState("normal");
      }

      if (!isMaximized) {
        const nextState = await window.imageEverything?.window.toggleNormalMaximized();
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

  const setCommandAlwaysOnTop = async (enabled: boolean) => {
    try {
      const state = await window.imageEverything?.window.setAlwaysOnTop(enabled);
      if (!state || state.actual !== enabled) {
        return commandOperationFailed(enabled ? t("error.windowPinEnableFailed") : t("error.windowPinDisableFailed"));
      }
      setIsAlwaysOnTop(state.actual);
      return { ok: true as const };
    } catch (error) {
      return commandOperationFailed(error instanceof Error ? error.message : t("error.windowPinUpdateFailed"));
    }
  };

  const getCommandLlamaStopBlocker = () => {
    if (isRecognitionTaskRunning()) {
      return t("error.stopRecognitionFirst");
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

  const clearCommandCache = async () => {
    try {
      const token = await window.imageEverything?.cache.authorizeClear();
      if (!token) {
        return commandOperationFailed(t("error.cacheFailed"));
      }
      const stats = await window.imageEverything?.cache.clearAll(token);
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

  const cycleSearchDirectory = () => {
    if (directoryOptions.length <= 1) return;
    const currentIndex = directoryOptions.findIndex((directory) => directory.id === search.directoryId);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % directoryOptions.length;
    updateResultsSearchOptions({ ...search, directoryId: directoryOptions[nextIndex].id });
  };

  const updateSkimDisplay = (nextSkimDisplay: SkimDisplayPreferences) => {
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
        void runSearch(lastResultSearchRef.current, { navigate: false, display: nextSkimDisplay });
      } else if (customRangeChanged) {
        viewDisplaySearchTimerRef.current = window.setTimeout(() => {
          viewDisplaySearchTimerRef.current = null;
          void runSearch(lastResultSearchRef.current, { navigate: false, display: nextSkimDisplay });
        }, 300);
      }
    }
    void window.imageEverything?.preferences.updateSkimDisplay(nextSkimDisplay).then((preferences) => {
      if (preferences) setSkimDisplay(preferences.skimDisplay);
    });
    if (changedDisplayMode) {
      showQuickCommandNotice(t(`search.displaySwitched.${changedDisplayMode}` as TranslationKey));
    }
  };

  const updateSystemNotifications = async (enabled: boolean) => {
    const preferences = await window.imageEverything?.preferences.updateSystemNotifications(enabled);
    if (preferences) {
      setSystemNotificationsEnabled(preferences.systemNotificationsEnabled);
    }
  };

  const clearCommandSkimCache = async () => {
    try {
      const token = await window.imageEverything?.skimCache.authorizeClear();
      if (!token) {
        return commandOperationFailed(t("error.cacheFailed"));
      }
      const stats = await window.imageEverything?.skimCache.clear(token);
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
      await window.imageEverything?.app.quit();
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
      defaultShortcutActions,
      currentAppearanceColors: appearanceColors,
      openSettings,
      openSkim,
      openSkimRoot: () => {
        if (view === "skim") {
          void loadSkimLocation(null);
        } else {
          openSkim();
        }
      },
      updateTheme,
      updateLanguage,
      updateAppearanceColors,
      updateStandbyLineVisible,
      updateEdgeSnapEnabled,
      updateLaunchAtLogin,
      updateOperationHints,
      updateQuickActionGlobalEnabled,
      updateShortcutActions: async (nextShortcutActions) => (
        (await updateShortcutActions(nextShortcutActions))?.applied ?? false
      ),
      updateCommandEnabled,
      showAllFiles: () => {
        showCommandResults({ ...getCommandBaseSearch(), query: "", directoryId: "all", fileFormat: "all", recognitionStatus: "all" });
      },
      showRecognizedFiles: () => {
        showCommandResults({ ...getCommandBaseSearch(), query: "", directoryId: "all", fileFormat: "all", recognitionStatus: "recognized" });
      },
      showUnrecognizedFiles: () => {
        showCommandResults({ ...getCommandBaseSearch(), query: "", directoryId: "all", fileFormat: "all", recognitionStatus: "unrecognized" });
      },
      showDirectory: showCommandDirectory,
      setShellMode: setCommandShellMode,
      maximizeWindow: maximizeCommandWindow,
      setAlwaysOnTop: setCommandAlwaysOnTop,
      showDirectoryLabel: () => {
        setSearchCapsuleLabelVisibility((currentVisibility) => {
          const nextVisibility = { ...currentVisibility, directory: true };
          void window.imageEverything?.preferences.updateSearchLabelVisibility(nextVisibility);
          return nextVisibility;
        });
      },
      selectDirectoryLabel: selectCommandDirectoryLabel,
      showSortLabel: () => {
        setSearchCapsuleLabelVisibility((currentVisibility) => {
          const nextVisibility = { ...currentVisibility, sort: true };
          void window.imageEverything?.preferences.updateSearchLabelVisibility(nextVisibility);
          return nextVisibility;
        });
      },
      setSortDirection: (sortDirection) => {
        const nextSearch = { ...getCommandBaseSearch(), sortDirection };
        updateResultsSearch(nextSearch, true);
      },
      setAllLabelsVisible: (visible) => {
        updateSearchCapsuleLabelVisibility({ directory: visible, recognition: visible, sort: visible, format: visible, skimDisplay: visible });
      },
      setDirectoryLabelVisible: (visible) => {
        setSearchCapsuleLabelVisibility((currentVisibility) => {
          const nextVisibility = { ...currentVisibility, directory: visible };
          void window.imageEverything?.preferences.updateSearchLabelVisibility(nextVisibility);
          return nextVisibility;
        });
      },
      setSortLabelVisible: (visible) => {
        setSearchCapsuleLabelVisibility((currentVisibility) => {
          const nextVisibility = { ...currentVisibility, sort: visible };
          void window.imageEverything?.preferences.updateSearchLabelVisibility(nextVisibility);
          return nextVisibility;
        });
      },
      startAllIndexes: startCommandAllIndexes,
      startDirectoryIndex: startCommandDirectoryIndex,
      continueIndexing: continueCommandIndexing,
      stopIndexing: stopCommandIndexing,
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
    if (submitQuickCommandIfNeeded(nextSearch)) {
      return;
    }

    const directoryInput = getAbsoluteWindowsDirectoryInput(nextSearch.query);
    if (directoryInput) {
      void window.imageEverything?.skim.resolveDirectoryPath(directoryInput).then((resolvedPath) => {
        if (directoryPathResolutionRequestRef.current !== directoryPathResolutionRequest) return;
        if (!resolvedPath) {
          showQuickCommandNotice(t("skim.directoryUnavailable"));
          return;
        }
        clearQuickCommandNotice();
        setSearch({ ...nextSearch, query: "" });
        openSkimAtLocation(resolvedPath);
      }).catch(() => {
        if (directoryPathResolutionRequestRef.current === directoryPathResolutionRequest) {
          showQuickCommandNotice(t("skim.directoryUnavailable"));
        }
      });
      return;
    }

    void runSearch(nextSearch);
  };

  const openResults = () => {
    const nextSearch = { ...search, recognitionStatus: "all" as const };
    setSearch(nextSearch);
    submitSearch(nextSearch);
  };

  const collapseShellToStandby = useCallback(() => {
    resetShellBehaviorState();
    setShellState("standby");
    closeNavigationOverlays();
  }, [closeNavigationOverlays, resetShellBehaviorState]);

  const expandCapsuleToMicro = useCallback(() => {
    resetShellBehaviorState();
    void window.imageEverything?.window.setShellState("micro", { forceBounds: true });
    setShellState("micro");
    const nextSearch = { ...search, query: search.query.trim(), recognitionStatus: "all" as const };
    setSearch(nextSearch);
    void runSearch(nextSearch);
  }, [resetShellBehaviorState, runSearch, search]);

  const submitCapsuleInput = () => {
    const nextSearch = { ...search, query: search.query.trim() };
    if (submitQuickCommandIfNeeded(nextSearch)) {
      return;
    }

    expandCapsuleToMicro();
  };

  const isCapsuleCompositionActive = useCallback(() => (
    capsuleComposingRef.current || Date.now() < capsuleCompositionGuardUntilRef.current
  ), []);

  const toggleNormalMaximized = useCallback(async () => {
    const nextState = await window.imageEverything?.window.toggleNormalMaximized();
    if (nextState) {
      setIsMaximized(nextState.isMaximized);
      setLastNormalBounds(nextState.lastNormalBounds);
    }
  }, []);

  const cycleShellWindow = useCallback(() => {
    if (shellState === "normal" || shellState === "settings") {
      void toggleNormalMaximized();
      return;
    }

    if (shellState === "micro") {
      setShellState("mini");
      return;
    }

    if (shellState === "mini") {
      setShellState("normal");
      return;
    }

    setShellState("micro");
  }, [shellState, toggleNormalMaximized]);

  const toggleAlwaysOnTop = useCallback(async () => {
    const requestedAlwaysOnTop = !isAlwaysOnTop;
    const alwaysOnTopState = await window.imageEverything?.window.setAlwaysOnTop(requestedAlwaysOnTop);
    if (alwaysOnTopState) {
      console.debug("[alwaysOnTop:toggle]", {
        requested: requestedAlwaysOnTop,
        actual: alwaysOnTopState.actual,
        mode: shellState
      });
      setIsAlwaysOnTop(alwaysOnTopState.actual);
    }
  }, [isAlwaysOnTop, shellState]);

  const openIndexView = (recognitionStatus: RecognitionStatusFilter) => {
    const nextSearch: SearchState = {
      ...search,
      query: "",
      directoryId: "all",
      fileFormat: "all",
      recognitionStatus
    };
    setShellState("normal");
    setSearch(nextSearch);
    void runSearch(nextSearch);
  };

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
      || search.recognitionStatus !== "all"
    ) {
      return;
    }

    const nextSearch = { ...search, query: "", directoryId: "all", fileFormat: "all", recognitionStatus: "all" as const };
    setSearch(nextSearch);
    await runSearch(nextSearch, { navigate: false });
  };

  const refreshResultsAfterIndexChange = async () => {
    if (resultsInitializedRef.current) {
      await runSearch(lastResultSearchRef.current, { navigate: false });
      return;
    }
    await refreshDefaultDirectoryResults();
  };

  useEffect(() => {
    if (
      scanResultsRefreshedDuringTaskRef.current
      || !isIndexing
      || (aiProgress?.phase !== "checking" && aiProgress?.phase !== "processing")
    ) {
      return;
    }
    scanResultsRefreshedDuringTaskRef.current = true;
    void refreshDefaultDirectoryResults();
  }, [aiProgress?.phase, isIndexing]);

  const applyDirectoryAddResult = async (result: DirectoryAddResult, showFeedback = true) => {
    refreshDirectories(result.directories);
    setDirectoryServiceUnavailable(false);
    if (result.added.length > 0) {
      const countedDirectories = await window.imageEverything?.directories.refreshFileCounts(result.added.map((directory) => directory.id));
      if (countedDirectories) refreshDirectories(countedDirectories);
      await refreshIndexStats();
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
      const result = await window.imageEverything?.directories.selectAndAdd();
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
      const result = await window.imageEverything?.directories.addCandidates({
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

  const saveSkimSidebarFolders = useCallback(async (nextFolders: string[]) => {
    try {
      const preferences = await window.imageEverything?.preferences.updateSkimSidebarFolders(nextFolders);
      if (!preferences) return false;
      setSkimSidebarFolders(preferences.skimSidebarFolders);
      const nextLocations = await window.imageEverything?.skim.listLocations();
      if (nextLocations?.length) setSkimLocations(nextLocations);
      return true;
    } catch (error) {
      const message = formatDisplayMessage(error instanceof Error ? error.message : t("skim.sidebar.updateFailed"));
      if (view === "skim") showSkimFeedback(message);
      else showQuickCommandNotice(message);
      return false;
    }
  }, [showQuickCommandNotice, showSkimFeedback, view]);

  const addSkimSidebarFolders = useCallback(async (folderPaths: string[]) => {
    const existingKeys = new Set(skimSidebarFolders.map(normalizeWindowsPathKey));
    const missingFolders = folderPaths.filter((folderPath) => !existingKeys.has(normalizeWindowsPathKey(folderPath)));
    if (missingFolders.length === 0) return;
    if (await saveSkimSidebarFolders([...skimSidebarFolders, ...missingFolders])) {
      showSkimFeedback(t("skim.sidebar.addedFeedback"));
    }
  }, [saveSkimSidebarFolders, showSkimFeedback, skimSidebarFolders]);

  const toggleSkimSystemLocations = useCallback(async () => {
    const nextCollapsed = !skimSystemLocationsCollapsed;
    setSkimSystemLocationsCollapsed(nextCollapsed);
    try {
      const preferences = await window.imageEverything?.preferences.updateSkimSystemLocationsCollapsed(nextCollapsed);
      if (preferences) setSkimSystemLocationsCollapsed(preferences.skimSystemLocationsCollapsed);
    } catch {
      setSkimSystemLocationsCollapsed(!nextCollapsed);
    }
  }, [skimSystemLocationsCollapsed]);

  const removeSkimSidebarFolder = useCallback(async (folderPath: string) => {
    const removedKey = normalizeWindowsPathKey(folderPath);
    const nextFolders = skimSidebarFolders.filter((candidate) => normalizeWindowsPathKey(candidate) !== removedKey);
    if (nextFolders.length === skimSidebarFolders.length) return;
    if (await saveSkimSidebarFolders(nextFolders)) {
      if (view === "skim") showSkimFeedback(t("skim.sidebar.removedFeedback"));
      else showQuickCommandNotice(t("skim.sidebar.removedFeedback"));
    }
  }, [saveSkimSidebarFolders, showQuickCommandNotice, showSkimFeedback, skimSidebarFolders, view]);

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
      const result = await window.imageEverything?.directories.addCandidates({
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
      const result = await window.imageEverything?.directories.addCandidates({
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
    const nextDirectories = await window.imageEverything?.directories.updateName(id, name);
    if (nextDirectories) {
      refreshDirectories(nextDirectories);
    }
    setEditingDirectoryId(null);
  };

  const deleteDirectoryById = async (directoryId: string) => {
    const deletedDirectories = await window.imageEverything?.directories.delete(directoryId);
    const reloadedDirectories = await window.imageEverything?.directories.list();
    const nextDirectories = reloadedDirectories ?? deletedDirectories;
    if (nextDirectories) refreshDirectories(nextDirectories);
    await refreshIndexStats();
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
    if (!directoryToDelete) return;
    await deleteDirectoryById(directoryToDelete);
    setDirectoryToDelete(null);
    setDialog(null);
  };

  const removeMissingSearchResults = (filePaths: string[]) => {
    if (filePaths.length === 0) {
      return;
    }

    const removedPathKeys = new Set(filePaths.map((filePath) => filePath.toLowerCase()));
    const removedImageIds = new Set(
      searchResults
        .filter((item) => removedPathKeys.has(item.filePath.toLowerCase()))
        .map((item) => item.id)
    );

    setSearchResults((current) => current.filter(
      (item) => !removedPathKeys.has(item.filePath.toLowerCase())
    ));
    setSearchStatus((current) => {
      const removedItems = current.images.filter(
        (item) => removedPathKeys.has(item.filePath.toLowerCase())
      );
      return {
        ...current,
        images: current.images.filter(
          (item) => !removedPathKeys.has(item.filePath.toLowerCase())
        ),
        unrecognizedCount: Math.max(
          0,
          current.unrecognizedCount - removedItems.filter(
            (item) => item.caption.trim().length === 0 || item.keywords.length === 0
          ).length
        ),
        failureStats: {
          parseFailures: Math.max(
            0,
            current.failureStats.parseFailures - removedItems.filter(
              (item) => item.failureType === "parse"
            ).length
          ),
          fileFailures: Math.max(
            0,
            current.failureStats.fileFailures - removedItems.filter(
              (item) => item.failureType === "file"
            ).length
          )
        }
      };
    });
    setSelectedResultImageId((current) => (
      current && removedImageIds.has(current) ? null : current
    ));
    setContextMenu((current) => (
      current && removedPathKeys.has(current.item.filePath.toLowerCase()) ? null : current
    ));
  };

  const scanAllDirectories = async () => {
    lastIndexTaskRequestRef.current = { kind: "all" };
    scanResultsRefreshedDuringTaskRef.current = false;
    setIsScanning(true);
    setScanSummary(null);
    setScanError("");
    setAiProgress(null);
    setIsCancellingRecognition(false);

    try {
      const result = await window.imageEverything?.scan.allDirectories();
      if (!result) {
        throw new Error(t("error.scanUnavailable"));
      }
      removeMissingSearchResults(result.removedFilePaths ?? []);
      refreshDirectories(result.directories);
      await refreshIndexStats();
      await refreshResultsAfterIndexChange();
      const fatalAiError = result.ai?.total === 0 && result.ai.completed === 0 && result.ai.failed === 0 && result.ai.errors.length > 0;
      setScanSummary({
        imageCount: result.imageCount,
        scanResultPath: result.scanResultPath,
        aiCompleted: result.ai?.completed ?? 0,
        aiFailed: result.ai?.failed ?? 0,
        aiTotal: result.ai?.total ?? 0
      });
      if (fatalAiError) {
        setScanError(result.ai?.errors[0]?.message ?? t("error.recognitionFailed"));
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("error.scanFailed");
      setScanError(message);
      setAiProgress((current) => ({
        phase: "failed",
        total: current?.total ?? 0,
        current: current?.current ?? 0,
        completed: current?.completed ?? 0,
        failed: current?.failed ?? 0,
        cancellable: false,
        message
      }));
    } finally {
      setIsScanning(false);
      setIsCancellingRecognition(false);
    }
  };

  const scanDirectory = async (directoryId: string) => {
    lastIndexTaskRequestRef.current = { kind: "directory", directoryId };
    scanResultsRefreshedDuringTaskRef.current = false;
    setIsScanning(true);
    setScanSummary(null);
    setScanError("");
    setAiProgress(null);
    setIsCancellingRecognition(false);

    try {
      const result = await window.imageEverything?.scan.directory(directoryId);
      if (!result) {
        throw new Error(t("error.scanUnavailable"));
      }
      removeMissingSearchResults(result.removedFilePaths ?? []);
      refreshDirectories(result.directories);
      await refreshIndexStats();
      await refreshResultsAfterIndexChange();
      const fatalAiError = result.ai?.total === 0 && result.ai.completed === 0 && result.ai.failed === 0 && result.ai.errors.length > 0;
      setScanSummary({
        imageCount: result.imageCount,
        scanResultPath: result.scanResultPath,
        aiCompleted: result.ai?.completed ?? 0,
        aiFailed: result.ai?.failed ?? 0,
        aiTotal: result.ai?.total ?? 0
      });
      if (fatalAiError) {
        setScanError(result.ai?.errors[0]?.message ?? t("error.recognitionFailed"));
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("error.scanFailed");
      setScanError(message);
      setAiProgress((current) => ({
        phase: "failed",
        total: current?.total ?? 0,
        current: current?.current ?? 0,
        completed: current?.completed ?? 0,
        failed: current?.failed ?? 0,
        cancellable: false,
        message
      }));
    } finally {
      setIsScanning(false);
      setIsCancellingRecognition(false);
    }
  };

  const continueRecognition = async () => {
    lastIndexTaskRequestRef.current = { kind: "continue" };
    scanResultsRefreshedDuringTaskRef.current = false;
    setIsContinuingRecognition(true);
    setScanSummary(null);
    setScanError("");
    setAiProgress(null);
    setIsCancellingRecognition(false);

    try {
      const result = await window.imageEverything?.index.continueRecognition();
      if (!result) {
        throw new Error(t("error.supplementUnavailable"));
      }
      removeMissingSearchResults(result.removedFilePaths ?? []);
      setIndexStats(result.stats);
      await refreshResultsAfterIndexChange();
      setScanSummary({
        imageCount: result.stats.totalVisualImages,
        scanResultPath: "",
        aiCompleted: result.ai.completed,
        aiFailed: result.ai.failed,
        aiTotal: result.ai.total
      });

      const fatalAiError = result.ai.total === 0 && result.ai.completed === 0 && result.ai.failed === 0 && result.ai.errors.length > 0;
      if (fatalAiError) {
        setScanError(result.ai.errors[0]?.message ?? t("error.recognitionFailed"));
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("error.supplementFailed");
      setScanError(message);
      setAiProgress((current) => ({
        phase: "failed",
        total: current?.total ?? 0,
        current: current?.current ?? 0,
        completed: current?.completed ?? 0,
        failed: current?.failed ?? 0,
        cancellable: false,
        message
      }));
    } finally {
      setIsContinuingRecognition(false);
      setIsCancellingRecognition(false);
    }
  };

  const cancelRecognition = async () => {
    setIsCancellingRecognition(true);
    await window.imageEverything?.index.cancelRecognition();
  };

  const retryIndexTask = () => {
    const request = lastIndexTaskRequestRef.current;
    if (!request || isIndexing) {
      return;
    }
    if (request.kind === "all") {
      void scanAllDirectories();
      return;
    }
    if (request.kind === "directory") {
      void scanDirectory(request.directoryId);
      return;
    }
    void continueRecognition();
  };

  const invokeFileAction = async (
    action: "open" | "showInFolder",
    item: ImageIndexItem
  ) => {
    setContextMenu(null);
    await window.imageEverything?.files[action](item.filePath);
  };

  const requestDeleteFiles = (items: ImageIndexItem[]) => {
    setContextMenu(null);
    if (items.length === 0) return;
    setFilesPendingDelete(items.map((item) => ({ ...item, keywords: [...item.keywords] })));
    setDeleteFilesFeedback(null);
    setDialog("deleteFiles");
  };

  const captureKeywordEditScrollSnapshot = () => {
    if (shellState !== "micro" && shellState !== "mini" && shellState !== "normal") {
      keywordEditScrollSnapshotRef.current = null;
      return;
    }

    const scrollContainer = document.querySelector<HTMLElement>(".cap-results-view .image-grid");
    const offset = scrollContainer
      ? shellState === "micro" ? scrollContainer.scrollLeft : scrollContainer.scrollTop
      : resultScrollPositionsRef.current[search.recognitionStatus];
    resultScrollPositionsRef.current[search.recognitionStatus] = offset;
    keywordEditScrollSnapshotRef.current = {
      offset,
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
      && snapshot.search.sortDirection === search.sortDirection
      && snapshot.search.recognitionStatus === search.recognitionStatus;
    if (searchUnchanged) {
      resultScrollPositionsRef.current[snapshot.search.recognitionStatus] = snapshot.offset;
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
    setEditCaption(frozenItems[0].caption);
    setEditKeywords(initialCommonKeywords.join(","));
    setEditMetadataError("");
    setDialog("editKeywords");
  };

  useEffect(() => {
    const unsubscribe = window.imageEverything?.preview.onItemAction((request) => {
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
        const updated = await window.imageEverything?.index.updateManualMetadata(
          keywordEditSession.items[0].filePath,
          editCaption,
          editKeywords
        );
        if (!updated) {
          throw new Error(t("error.indexUnavailable"));
        }
      } else {
        const result = await window.imageEverything?.index.updateKeywordsBatch({
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
      await Promise.allSettled([
        runSearch(search, { navigate: false }),
        refreshIndexStats()
      ]);
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
      const result = await window.imageEverything?.files.moveToTrash(
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
      const deletedUnrecognizedCount = deletedItems.filter(
        (item) => item.resultKind === "visual"
          && (item.caption.trim().length === 0 || item.keywords.length === 0)
      ).length;
      const deletedParseFailures = deletedItems.filter((item) => item.failureType === "parse").length;
      const deletedFileFailures = deletedItems.filter((item) => item.failureType === "file").length;

      setSearchResults((current) => current.filter(
        (item) => !deletedPathKeys.has(item.filePath.toLowerCase())
      ));
      setSearchStatus((current) => ({
        ...current,
        images: current.images.filter(
          (item) => !deletedPathKeys.has(item.filePath.toLowerCase())
        ),
        unrecognizedCount: Math.max(0, current.unrecognizedCount - deletedUnrecognizedCount),
        failureStats: {
          parseFailures: Math.max(0, current.failureStats.parseFailures - deletedParseFailures),
          fileFailures: Math.max(0, current.failureStats.fileFailures - deletedFileFailures)
        }
      }));
      setSelectedResultImageId((current) => (
        current && deletedImageIds.has(current) ? null : current
      ));
      void Promise.allSettled([
        refreshIndexStats(),
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
    void window.imageEverything?.preview.close();
    clearSkimFeedback();
    lastClosedSkimPathRef.current = skimCurrentPath;
    setSkimEntries([]);
    setSkimCurrentPath(null);
    setSkimBreadcrumbs([]);
    skimForwardPathsRef.current = [];
    const returnContext = skimReturnContextRef.current;
    skimReturnContextRef.current = null;
    if (returnContext) {
      if (
        returnContext.shellState !== "micro"
        && returnContext.shellState !== "mini"
        && returnContext.shellState !== "normal"
      ) {
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
    if (shellState !== "micro" && shellState !== "mini" && shellState !== "normal") {
      setShellState("normal");
    }
  }, [cancelSkimRead, clearSkimFeedback, openResults, restoreViewAfterSkim, shellState, skimCurrentPath]);

  const openSkimAtLocation = useCallback((nextPath: string | null) => {
    if (skimLocationPickerCloseTimerRef.current !== null) {
      window.clearTimeout(skimLocationPickerCloseTimerRef.current);
      skimLocationPickerCloseTimerRef.current = null;
    }
    skimLocationPickerCloseActionRef.current = null;
    setSkimLocationPickerOpen(false);
    setSkimLocationPickerClosing(false);
    if (view === "skim") {
      void loadSkimLocation(nextPath).then((loaded) => {
        if (loaded) skimForwardPathsRef.current = [];
      });
      return;
    }
    const returnView: Exclude<AppView, "skim"> = view === "home" ? "results" : view;
    const returnShellState = shellState === "standby" || shellState === "capsule"
      ? "normal"
      : shellState;
    skimReturnContextRef.current = { view: returnView, shellState: returnShellState };
    setSkimEntries([]);
    setSkimCurrentPath(null);
    setSkimBreadcrumbs([]);
    skimForwardPathsRef.current = [];
    if (shellState !== "micro" && shellState !== "mini" && shellState !== "normal") {
      setShellState("normal");
    }
    navigateTo("skim");
    void loadSkimLocation(nextPath);
  }, [loadSkimLocation, navigateTo, shellState, view]);

  const openSkim = useCallback(() => {
    if (view === "skim") {
      if (shellState === "standby" || shellState === "capsule") {
        setShellState("normal");
      }
      return;
    }
    openSkimAtLocation(null);
  }, [openSkimAtLocation, shellState, view]);

  const openSkimLocation = useCallback((nextPath: string | null) => {
    void loadSkimLocation(nextPath).then((loaded) => {
      if (loaded) skimForwardPathsRef.current = [];
    });
  }, [loadSkimLocation]);

  const closeSkimLocationPicker = useCallback((afterClose?: () => void) => {
    if (
      !skimLocationPickerOpen
      || skimLocationPickerClosing
      || skimLocationPickerCloseTimerRef.current !== null
    ) return;
    skimLocationPickerCloseActionRef.current = afterClose ?? null;
    setSkimLocationPickerClosing(true);
    skimLocationPickerCloseTimerRef.current = window.setTimeout(() => {
      skimLocationPickerCloseTimerRef.current = null;
      setSkimLocationPickerOpen(false);
      setSkimLocationPickerClosing(false);
      const closeAction = skimLocationPickerCloseActionRef.current;
      skimLocationPickerCloseActionRef.current = null;
      closeAction?.();
    }, 280);
  }, [skimLocationPickerClosing, skimLocationPickerOpen]);

  const toggleSkimLocationPicker = useCallback(() => {
    if (dialog === "editKeywords" || isAddingDirectory) return;
    if (skimLocationPickerOpen) {
      closeSkimLocationPicker();
      return;
    }
    setContextMenu(null);
    setSkimLocationPickerClosing(false);
    setSkimLocationPickerOpen(true);
    void window.imageEverything?.skim.listLocations().then((nextLocations) => {
      if (nextLocations?.length) setSkimLocations(nextLocations);
    });
  }, [closeSkimLocationPicker, dialog, isAddingDirectory, skimLocationPickerOpen]);

  const handleSkimLocationPickerExit = useCallback(() => {
    if (view === "skim") {
      closeSkimLocationPicker(closeSkim);
      return;
    }
    closeSkimLocationPicker();
  }, [closeSkim, closeSkimLocationPicker, view]);

  const navigateSkimBack = useCallback(() => {
    if (skimCurrentPath === null) {
      closeSkim();
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

  const navigateSkimForward = useCallback(() => {
    const nextPath = skimForwardPathsRef.current[skimForwardPathsRef.current.length - 1];
    if (!nextPath) return;
    void loadSkimLocation(nextPath).then((loaded) => {
      if (loaded && skimForwardPathsRef.current[skimForwardPathsRef.current.length - 1] === nextPath) {
        skimForwardPathsRef.current.pop();
      }
    });
  }, [loadSkimLocation]);

  function openSettings(section?: "quick" | "cmd") {
    settingsOpenedFromSkimRef.current = view === "skim";
    if (view === "skim") {
      cancelSkimRead();
      clearSkimFeedback();
    }
    if (section === "quick") {
      setQuickActionsExpanded(true);
    }
    if (section === "cmd") {
      setQuickCommandsExpanded(true);
    }
    setShellState("settings");
    navigateTo("settings");
    void refreshLlamaRuntimeSettings();
    void refreshGgufModelSettings();
    void refreshVisualCacheStats();
  }

  useEffect(() => {
    const unsubscribe = window.imageEverything?.window.onOpenSettingsRequested?.(() => {
      if (dialog !== "editKeywords") openSettings();
    });
    return () => unsubscribe?.();
  }, [dialog, openSettings]);

  useEffect(() => {
    const unsubscribe = window.imageEverything?.window.onToggleSkimLocationPickerRequested?.(() => {
      toggleSkimLocationPicker();
    });
    return () => unsubscribe?.();
  }, [toggleSkimLocationPicker]);

  useEffect(() => {
    const unsubscribe = window.imageEverything?.window.onActivateSkimRequested?.(() => {
      if (dialog !== "editKeywords") openSkim();
    });
    return () => unsubscribe?.();
  }, [dialog, openSkim]);

  const closeSettings = () => {
    setShellState("normal");
    if (settingsOpenedFromSkimRef.current) {
      settingsOpenedFromSkimRef.current = false;
      const previousIndex = navigationIndexRef.current - 1;
      if (previousIndex >= 0) navigationIndexRef.current = previousIndex;
      closeNavigationOverlays();
      setView("skim");
      void loadSkimLocation(skimCurrentPath);
      return;
    }
    const previousIndex = navigationIndexRef.current - 1;
    const previousView = previousIndex >= 0 ? navigationEntriesRef.current[previousIndex] : null;
    if (previousView === "results" && resultsInitializedRef.current) {
      navigateBack();
      return;
    }

    const nextSearch = { ...search, query: "", recognitionStatus: "all" as const };
    setSearch(nextSearch);
    resetSettingsViewState(true);
    void runSearch(nextSearch);
  };

  const refreshCurrentPage = async () => {
    if (
      shellState === "standby"
      || shellState === "capsule"
      || dialog
      || contextMenu
      || skimLocationPickerOpen
      || editingDirectoryId
      || pendingQuickCommandConfirmation
      || isAddingDirectory
      || isClearingCache
      || isClearingSkimCache
      || isDeletingFiles
      || isSavingMetadata
      || isIndexing
    ) {
      return;
    }

    if (view === "skim") {
      await loadSkimLocation(skimCurrentPath);
      return;
    }

    if (shellState === "settings" || view === "settings") {
      const directoryIds = directories.map((directory) => directory.id);
      const countedDirectories = directoryIds.length > 0
        ? await window.imageEverything?.directories.refreshFileCounts(directoryIds)
        : undefined;
      if (countedDirectories) refreshDirectories(countedDirectories);
      await Promise.all([
        refreshIndexStats(),
        refreshVisualCacheStats(),
        refreshLlamaRuntimeSettings(),
        refreshGgufModelSettings()
      ]);
      return;
    }

    if (view === "home" || view === "results") {
      await window.imageEverything?.search.refresh(search.directoryId === "all" ? undefined : [search.directoryId]);
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
      if (event.button === 3) {
        if (view === "skim") {
          navigateSkimBack();
          return;
        }
        if (shellState === "settings" || view === "settings") {
          closeSettings();
          return;
        }
        navigateBack();
      } else if (view === "skim") {
        navigateSkimForward();
      } else {
        const nextIndex = navigationIndexRef.current + 1;
        if (navigationEntriesRef.current[nextIndex] === "settings") {
          openSettings();
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
  }, [closeSettings, dialog, navigateBack, navigateForward, navigateSkimBack, navigateSkimForward, openSettings, openSkimAtLocation, shellState, view]);

  useEffect(() => {
    const unsubscribe = window.imageEverything?.window.onActivateCapsuleShortcut?.(() => {
      window.setTimeout(() => {
        capsuleInputRef.current?.focus();
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
        if (shellState === "capsule" && (event.isComposing || isCapsuleCompositionActive())) {
          return;
        }
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

        if (dialog === "deleteFiles") {
          if (isDeletingFiles || deleteFilesFeedback?.status === "succeeded") return;
          setFilesPendingDelete([]);
          setDeleteFilesFeedback(null);
          setDialog(null);
          return;
        }

        if (dialog === "deleteDirectory") {
          setDirectoryToDelete(null);
          setDialog(null);
          return;
        }

        if (dialog === "addDroppedDirectories") {
          if (isAddingDirectory) return;
          setDroppedDirectories([]);
          setDialog(null);
          directoryAddFeedbackTargetRef.current = "search";
          return;
        }

        if (dialog === "replaceDirectories") {
          if (isAddingDirectory) return;
          setPendingDirectoryAddResult(null);
          setDialog(null);
          if (directoryAddFeedbackTargetRef.current === "skim") showSkimFeedback(t("command.cancelled"));
          else showQuickCommandNotice(t("command.cancelled"));
          directoryAddFeedbackTargetRef.current = "search";
          return;
        }

        if (dialog === "clearCache") {
          if (isClearingCache || cacheClearFeedback?.status === "succeeded") return;
          setCacheClearToken(null);
          setCacheClearFeedback(null);
          setDialog(null);
          return;
        }

        if (dialog === "clearSkimCache") {
          if (isClearingSkimCache || skimCacheClearFeedback?.status === "succeeded") return;
          setSkimCacheClearToken(null);
          setSkimCacheClearFeedback(null);
          setDialog(null);
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

        if (shellState === "capsule") {
          setSearch((currentSearch) => ({ ...currentSearch, query: "" }));
          collapseShellToStandby();
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

      const searchResultsVisible = (
        shellState === "micro"
        || shellState === "mini"
        || shellState === "normal"
      ) && (view === "home" || view === "results");
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

      if (matchesShortcutEvent(event, shortcutActions.activateSkim)) {
        event.preventDefault();
        event.stopPropagation();
        closeNavigationOverlays();
        openSkim();
        return;
      }

      if (matchesShortcutEvent(event, shortcutActions.openSettings)) {
        event.preventDefault();
        event.stopPropagation();
        closeNavigationOverlays();
        if (shellState !== "settings") {
          openSettings();
        }
        return;
      }
    };

    window.addEventListener("keydown", handleWindowShortcutKeyDown);
    return () => window.removeEventListener("keydown", handleWindowShortcutKeyDown);
  }, [
    closeNavigationOverlays,
    collapseShellToStandby,
    cacheClearFeedback,
    contextMenu,
    cycleSearchDirectory,
    deleteFilesFeedback,
    dialog,
    directories,
    editingDirectoryId,
    isAddingDirectory,
    isClearingCache,
    isClearingSkimCache,
    isDeletingFiles,
    isSavingMetadata,
    isIndexing,
    isCapsuleCompositionActive,
    openSkim,
    openSettings,
    pendingQuickCommandConfirmation,
    quickActionGlobalEnabled,
    search,
    selectedResultImageId,
    showQuickCommandNotice,
    showSkimFeedback,
    shellState,
    skimCacheClearFeedback,
    skimCurrentPath,
    shortcutActions,
    view
  ]);

  const updateSelectedLlamaRuntime = async (version: string) => {
    const settings = await window.imageEverything?.llamaRuntime.updateSelected(version);
    if (settings) {
      setLlamaRuntimeSettings(settings);
    }
    return settings ?? null;
  };

  const updateSelectedGgufModel = async (modelId: string) => {
    const settings = await window.imageEverything?.ggufModels.updateSelected(modelId);
    if (settings) {
      setGgufModelSettings(settings);
    }
    return settings ?? null;
  };

  const startLlamaRuntimeServer = async () => {
    setIsChangingLlamaRuntimeState(true);
    try {
      const state = await window.imageEverything?.llamaRuntime.start();
      if (state) {
        setLlamaRuntimeProcessState(state);
      }
      return state ?? null;
    } finally {
      setIsChangingLlamaRuntimeState(false);
    }
  };

  const stopLlamaRuntimeServer = async () => {
    setIsChangingLlamaRuntimeState(true);
    try {
      const state = await window.imageEverything?.llamaRuntime.stop();
      if (state) {
        setLlamaRuntimeProcessState(state);
      }
      return state ?? null;
    } finally {
      setIsChangingLlamaRuntimeState(false);
    }
  };

  const clearVisualCaches = async () => {
    if (isClearingCache) return null;

    const isRetry = cacheClearFeedback?.status === "failed";
    let token = cacheClearToken;
    try {
      if (!token || isRetry) {
        token = await window.imageEverything?.cache.authorizeClear() ?? null;
      }
    } catch (error) {
      setCacheClearFeedback({
        status: "failed",
        message: formatDisplayMessage(error instanceof Error ? error.message : t("error.cacheUnavailable"))
      });
      return null;
    }
    if (!token) {
      setCacheClearFeedback({ status: "failed", message: t("error.cacheUnavailable") });
      return null;
    }

    setIsClearingCache(true);
    try {
      const stats = await window.imageEverything?.cache.clearAll(token);
      if (!stats) {
        throw new Error(t("error.cacheUnavailable"));
      }
      setVisualCacheStats(stats);
      setCacheClearToken(null);
      if (isRetry) {
        setCacheClearFeedback({ status: "succeeded", message: "" });
      } else {
        setCacheClearFeedback(null);
        setDialog(null);
        showCacheInlineFeedback(t("settings.cacheCleared"));
      }
      return stats ?? null;
    } catch (error) {
      setCacheClearToken(null);
      setCacheClearFeedback({
        status: "failed",
        message: formatDisplayMessage(error instanceof Error ? error.message : t("error.cacheFailed"))
      });
      return null;
    } finally {
      setIsClearingCache(false);
    }
  };

  const requestClearThumbnailCache = async () => {
    try {
      const token = await window.imageEverything?.cache.authorizeClear();
      if (!token) {
        throw new Error(t("error.cacheUnavailable"));
      }
      setCacheClearToken(token);
      setCacheClearFeedback(null);
      setDialog("clearCache");
    } catch (error) {
      setCacheClearToken(null);
      setCacheClearFeedback({
        status: "failed",
        message: formatDisplayMessage(error instanceof Error ? error.message : t("error.cacheUnavailable"))
      });
      setDialog("clearCache");
    }
  };

  const clearSkimCaches = async () => {
    if (isClearingSkimCache) return null;
    const isRetry = skimCacheClearFeedback?.status === "failed";
    let token = skimCacheClearToken;
    try {
      if (!token || isRetry) token = await window.imageEverything?.skimCache.authorizeClear() ?? null;
      if (!token) throw new Error(t("error.cacheUnavailable"));
      setIsClearingSkimCache(true);
      const stats = await window.imageEverything?.skimCache.clear(token);
      if (!stats) throw new Error(t("error.cacheUnavailable"));
      setSkimCacheStats(stats);
      setSkimCacheClearToken(null);
      if (isRetry) {
        setSkimCacheClearFeedback({ status: "succeeded", message: "" });
      } else {
        setSkimCacheClearFeedback(null);
        setDialog(null);
        showSkimCacheInlineFeedback(t("settings.skimCacheCleared"));
      }
      return stats;
    } catch (error) {
      setSkimCacheClearToken(null);
      setSkimCacheClearFeedback({
        status: "failed",
        message: formatDisplayMessage(error instanceof Error ? error.message : t("error.cacheFailed"))
      });
      return null;
    } finally {
      setIsClearingSkimCache(false);
    }
  };

  const requestClearSkimCache = async () => {
    try {
      const token = await window.imageEverything?.skimCache.authorizeClear();
      if (!token) throw new Error(t("error.cacheUnavailable"));
      setSkimCacheClearToken(token);
      setSkimCacheClearFeedback(null);
      setDialog("clearSkimCache");
    } catch (error) {
      setSkimCacheClearToken(null);
      setSkimCacheClearFeedback({
        status: "failed",
        message: formatDisplayMessage(error instanceof Error ? error.message : t("error.cacheUnavailable"))
      });
      setDialog("clearSkimCache");
    }
  };

  const isExpandedShell = shellState !== "standby" && shellState !== "capsule";
  const showShellSettingsToggle = miniStandardHeight !== null && shellViewportHeight >= miniStandardHeight;
  const isLargeShell = shellState === "normal" || shellState === "settings";
  const shellCycleLabel = isLargeShell ? (isMaximized ? t("window.restore") : t("window.maximize")) : t("window.changeMode");
  const shellControlActions: WindowControlAction[] = shellState === "capsule"
    ? []
    : [
      { id: "standby", label: t("window.collapse"), icon: "line", onClick: collapseShellToStandby },
      { id: "cycle", label: shellCycleLabel, icon: "expand", pressed: isMaximized, onClick: cycleShellWindow },
      { id: "pin", label: t("window.pinToggle"), icon: isAlwaysOnTop ? "pinOn" : "pinOff", pressed: isAlwaysOnTop, onClick: toggleAlwaysOnTop }
    ];
  const activeView = isExpandedShell && view === "home" ? "results" : view;
  useEffect(() => {
    if (skimLocationPickerCloseTimerRef.current !== null) {
      window.clearTimeout(skimLocationPickerCloseTimerRef.current);
      skimLocationPickerCloseTimerRef.current = null;
    }
    skimLocationPickerCloseActionRef.current = null;
    setSkimLocationPickerOpen(false);
    setSkimLocationPickerClosing(false);
  }, [dialog, shellState, view]);
  const shellTransitionClass = shellTransition
    ? ` cap-shell-transition cap-transition-${shellTransition.from}-to-${shellTransition.to}`
    : "";
  const hasLastNormalBounds = lastNormalBounds !== null;
  const acceptsDirectoryDrop = (
    shellState === "micro"
    || shellState === "mini"
    || shellState === "normal"
    || shellState === "settings"
  ) && dialog === null && !isAddingDirectory;

  return (
    <div
      className={`app theme-${effectiveTheme} cap-shell cap-shell-${shellState}${shellTransitionClass}${isAlwaysOnTop ? " cap-shell-always-on-top" : ""}${isMaximized ? " cap-shell-maximized" : ""}${hasLastNormalBounds ? " cap-shell-has-restore-bounds" : ""}${dialog ? " cap-shell-dialog-open" : ""}${dialog === "editKeywords" ? " cap-shell-keyword-editor-open" : ""}`}
      style={appThemeStyle}
      onDragOverCapture={(event: ReactDragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = acceptsDirectoryDrop && !internalNativeDragRef.current ? "copy" : "none";
      }}
      onDropCapture={(event: ReactDragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (internalNativeDragRef.current) {
          internalNativeDragRef.current = false;
          return;
        }
        if (!acceptsDirectoryDrop) return;
        const nextDroppedDirectories = readDroppedDirectories(event.dataTransfer);
        if (nextDroppedDirectories.length === 0) return;
        setContextMenu(null);
        setDroppedDirectories(nextDroppedDirectories);
        directoryAddFeedbackTargetRef.current = view === "skim" ? "skim" : "search";
        setDialog("addDroppedDirectories");
      }}
      onClick={() => {
        setContextMenu(null);
      }}
    >
      {DEBUG_WINDOW_BOUNDS && (shellState === "standby" || shellState === "capsule") && (
        <div className="cap-debug-window-viewport" aria-hidden="true" />
      )}
      {shellState === "capsule" && (
        <div className="cap-capsule-stage">
          <form
            className="cap-capsule"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (!isCapsuleCompositionActive()) {
                submitCapsuleInput();
              }
            }}
          >
            <input
              className={operationHintVisible ? "cap-operation-hint" : undefined}
              ref={capsuleInputRef}
              value={search.query}
              placeholder={searchInputFeedback}
              title={searchInputFeedback || undefined}
              onChange={(event) => {
                clearQuickCommandNotice();
                setSearch((current) => ({ ...current, query: event.target.value }));
              }}
              onCompositionStart={() => {
                capsuleComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                capsuleComposingRef.current = false;
                capsuleCompositionGuardUntilRef.current = Date.now() + 180;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && ((event.nativeEvent as KeyboardEvent).isComposing || isCapsuleCompositionActive())) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
              aria-label={t("search.action")}
              autoComplete="off"
            />
          </form>
        </div>
      )}
      {isExpandedShell && (
        <WindowControlRail
          actions={shellControlActions}
          showSkim={showShellSettingsToggle}
          skimActive={skimLocationPickerOpen}
          skimCurrent={false}
          skimExpanded={skimLocationPickerOpen}
          skimLabel={skimLocationPickerOpen ? t("skim.locationPicker.close") : t("skim.locationPicker.open")}
          onSkim={toggleSkimLocationPicker}
          settingsActive={shellState === "settings"}
          showSettings={showShellSettingsToggle}
          settingsLabel={shellState === "settings" && settingsOpenedFromSkimRef.current ? t("window.returnSkim") : undefined}
          onSettings={shellState === "settings" ? closeSettings : openSettings}
        />
      )}
      {isExpandedShell && (
        <>
          <div className="cap-shell-content">
            {dialog === "addDroppedDirectories" && droppedDirectories.length > 0 && (
              <AddDroppedDirectoriesPanel
                directories={droppedDirectories}
                isAdding={isAddingDirectory}
                onConfirm={() => void confirmDroppedDirectoryAdd()}
                onCancel={cancelDroppedDirectoryAdd}
              />
            )}
            {activeView === "home" && (
              <HomeView
                search={search}
                directoryName={selectedDirectory.name}
                directories={directoryOptions}
                labelVisibility={searchCapsuleLabelVisibility}
                onSearchChange={setSearch}
                onLabelVisibilityChange={updateSearchCapsuleLabelVisibility}
                onSearch={openResults}
                onSearchOptionsChange={updateResultsSearchOptions}
              />
            )}
            {activeView === "results" && dialog === "deleteFiles" && (
              <DeleteFilesPanel
                isDeleting={isDeletingFiles}
                fileCount={filesPendingDelete.length}
                feedback={deleteFilesFeedback}
                onConfirm={confirmDeleteFiles}
                onCancel={() => {
                  if (deleteFilesFeedback?.status === "succeeded") return;
                  setFilesPendingDelete([]);
                  setDeleteFilesFeedback(null);
                  setDialog(null);
                }}
                onComplete={() => {
                  setFilesPendingDelete([]);
                  setDeleteFilesFeedback(null);
                  setDialog(null);
                }}
              />
            )}
            {isExpandedShell && activeView === "results" && dialog !== "deleteFiles" && (
              <ResultsView
                shellState={shellState}
                search={search}
                searchCapsule={(
                  <Cap7CESearchCapsule
                    search={search}
                    directoryName={selectedDirectory.name}
                    directories={directoryOptions}
                    labelVisibility={searchCapsuleLabelVisibility}
                    status={<ResultStatus search={search} resultCount={searchResults.length} searchStatus={searchStatus} isSearching={isSearching} />}
                    inputFeedback={searchInputFeedback}
                    inputFeedbackIsGuide={operationHintVisible}
                    unified
                    autoSearchOnQueryClear
                    skimDisplayMode={skimDisplay.searchMode}
                    enabledLabelGroups={standardSearchLabelGroups}
                    imageContextMenuOpen={contextMenu !== null}
                    inputRef={searchInputRef}
                    onSearchChange={(nextSearch) => {
                      clearQuickCommandNotice();
                      updateResultsSearch(nextSearch);
                    }}
                    onLabelVisibilityChange={updateSearchCapsuleLabelVisibility}
                    onSkimDisplayModeChange={(searchMode) => updateSkimDisplay({ ...skimDisplay, searchMode })}
                    onSearchOptionsChange={updateResultsSearchOptions}
                    onSearch={() => submitSearch(search)}
                    onImageContextMenuClose={closeContextMenu}
                  />
                )}
                images={searchResults}
                isSearching={isSearching}
                searchError={searchError}
                contextMenuTheme={effectiveTheme}
                appearanceColors={appearanceColors}
                imageContextMenuOpen={contextMenu !== null}
                keywordEditorOpen={dialog === "editKeywords"}
                selectedImageId={selectedResultImageId}
                clearSelectionRequestId={clearSelectionRequestId}
                scrollTop={resultScrollPositionsRef.current[search.recognitionStatus]}
                onSelectedImageChange={setSelectedResultImageId}
                onScrollTopChange={(scrollTop) => {
                  resultScrollPositionsRef.current[search.recognitionStatus] = scrollTop;
                }}
                onFeedback={showQuickCommandNotice}
                onEditKeywords={requestEditKeywords}
                onContextMenu={(event, item, selectedItems, preview) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setContextMenu({
                    x: event.clientX,
                    y: event.clientY,
                    item,
                    items: selectedItems,
                    preview,
                    shellState
                  });
                }}
                onContextMenuClose={closeContextMenu}
                onOpenImage={(item) => invokeFileAction("open", item)}
                onOpenSkim={openSkim}
              />
            )}
            {activeView === "skim" && (
              <SkimView
                search={{ ...search, ...skimSortPreference }}
                visualSessionId={skimVisualSessionId}
                entries={sortedSkimEntries}
                currentPath={skimCurrentPath}
                breadcrumbs={skimBreadcrumbs}
                isLoading={isSkimLoading}
                feedback={skimFeedback}
                theme={effectiveTheme}
                appearanceColors={appearanceColors}
                shellState={shellState}
                isAddingDirectory={isAddingDirectory}
                inputFeedback={searchInputFeedback}
                inputFeedbackIsGuide={operationHintVisible}
                labelVisibility={searchCapsuleLabelVisibility}
                skimDisplayMode={skimDisplay.mode}
                searchInputRef={searchInputRef}
                onSearchChange={(nextSearch) => setSearch({
                  ...nextSearch,
                  sortField: search.sortField,
                  sortDirection: search.sortDirection
                })}
                onSearchOptionsChange={updateSkimSort}
                onLabelVisibilityChange={updateSearchCapsuleLabelVisibility}
                onSkimDisplayModeChange={(mode) => updateSkimDisplay({ ...skimDisplay, mode })}
                onSearch={() => submitSearch(search)}
                onOpenRoot={() => openSkimLocation(null)}
                onOpenBreadcrumb={openSkimLocation}
                onOpenEntry={(entry) => {
                  if (entry.kind === "drive" || entry.kind === "folder") {
                    openSkimLocation(entry.path);
                  }
                }}
                onAddEntries={(entries) => void addSkimEntries(entries)}
                sidebarFolderPaths={skimSidebarFolders}
                sidebarKnownPaths={skimLocations.flatMap((location) => location.path ? [location.path] : [])}
                onAddSidebarFolders={(folderPaths) => void addSkimSidebarFolders(folderPaths)}
                onFeedback={showSkimFeedback}
                onNativeDragStateChange={(active) => {
                  internalNativeDragRef.current = active;
                }}
              />
            )}
            {activeView === "settings" && dialog === "deleteDirectory" && (
              <DeleteDirectoryPanel
                onConfirm={confirmDeleteDirectory}
                onCancel={() => setDialog(null)}
              />
            )}
            {dialog === "replaceDirectories" && pendingDirectoryAddResult && (
              <ReplaceDirectoriesPanel
                conflictCount={pendingDirectoryAddResult.conflicts.length}
                replacedCount={pendingDirectoryAddResult.conflicts.reduce(
                  (count, conflict) => count + conflict.existingDirectories.length,
                  0
                )}
                isAdding={isAddingDirectory}
                onConfirm={confirmDirectoryReplacement}
                onCancel={() => {
                  if (isAddingDirectory) return;
                  setPendingDirectoryAddResult(null);
                  setDialog(null);
                  if (directoryAddFeedbackTargetRef.current === "skim") showSkimFeedback(t("command.cancelled"));
                  else showQuickCommandNotice(t("command.cancelled"));
                  directoryAddFeedbackTargetRef.current = "search";
                }}
              />
            )}
            {activeView === "settings" && dialog === "clearCache" && (
              <ClearCachePanel
                isClearing={isClearingCache}
                feedback={cacheClearFeedback}
                onConfirm={clearVisualCaches}
                onCancel={() => {
                  if (cacheClearFeedback?.status === "succeeded") return;
                  setCacheClearToken(null);
                  setCacheClearFeedback(null);
                  setDialog(null);
                }}
                onComplete={() => {
                  setCacheClearToken(null);
                  setCacheClearFeedback(null);
                  setDialog(null);
                }}
              />
            )}
            {activeView === "settings" && dialog === "clearSkimCache" && (
              <ClearCachePanel
                isClearing={isClearingSkimCache}
                feedback={skimCacheClearFeedback}
                skim
                onConfirm={clearSkimCaches}
                onCancel={() => {
                  if (skimCacheClearFeedback?.status === "succeeded") return;
                  setSkimCacheClearToken(null);
                  setSkimCacheClearFeedback(null);
                  setDialog(null);
                }}
                onComplete={() => {
                  setSkimCacheClearToken(null);
                  setSkimCacheClearFeedback(null);
                  setDialog(null);
                }}
              />
            )}
            {activeView === "settings" && dialog !== "deleteDirectory" && dialog !== "replaceDirectories" && dialog !== "clearCache" && dialog !== "clearSkimCache" && (
              <SettingsView
                search={search}
                quickCommandNotice={searchInputFeedback}
                inputFeedbackIsGuide={operationHintVisible}
                searchInputRef={searchInputRef}
                directoryName={selectedDirectory.name}
                status="ready"
                searchDirectories={directoryOptions}
                labelVisibility={searchCapsuleLabelVisibility}
                theme={theme}
                menuStyle={contextMenuStyle}
                languagePreference={languagePreference}
                appearanceColors={appearanceColors}
                edgeSnapEnabled={edgeSnapEnabled}
                standbyLineVisible={standbyLineVisible}
                launchAtLogin={launchAtLogin}
                systemNotificationsEnabled={systemNotificationsEnabled}
                operationHintsEnabled={operationHintsEnabled}
                quickActionGlobalEnabled={quickActionGlobalEnabled}
                shortcutActions={shortcutActions}
                unavailableShortcutActionIds={unavailableShortcutActionIds}
                quickActionsExpanded={quickActionsExpanded}
                quickCommandsExpanded={quickCommandsExpanded}
                skimDisplay={skimDisplay}
                directories={directories}
                isLoadingDirectories={isLoadingDirectories}
                isAddingDirectory={isAddingDirectory}
                directoryServiceUnavailable={directoryServiceUnavailable}
                isScanning={isIndexing}
                isCancellingRecognition={isCancellingRecognition}
                aiProgress={aiProgress}
                scanSummary={scanSummary}
                scanError={scanError}
                indexStats={indexStats}
                llamaRuntimeSettings={llamaRuntimeSettings}
                llamaRuntimeProcessState={llamaRuntimeProcessState}
                ggufModelSettings={ggufModelSettings}
                isLoadingLlamaRuntime={isLoadingLlamaRuntime}
                isLoadingGgufModels={isLoadingGgufModels}
                isChangingLlamaRuntimeState={isChangingLlamaRuntimeState}
                visualCacheStats={visualCacheStats}
                skimCacheStats={skimCacheStats}
                thumbnailOptimizationStatus={thumbnailOptimizationStatus}
                isLoadingCacheStats={isLoadingCacheStats}
                isClearingCache={isClearingCache}
                isClearingSkimCache={isClearingSkimCache}
                cacheInlineFeedback={cacheInlineFeedback}
                skimCacheInlineFeedback={skimCacheInlineFeedback}
                editingDirectoryId={editingDirectoryId}
                onSearchChange={(nextSearch) => {
                  clearQuickCommandNotice();
                  setSearch(nextSearch);
                }}
                onLabelVisibilityChange={updateSearchCapsuleLabelVisibility}
                onSearchOptionsChange={updateResultsSearchOptions}
                onThemeChange={updateTheme}
                onLanguageChange={updateLanguage}
                onAppearanceColorsPreview={previewAppearanceColors}
                onAppearanceColorsChange={updateAppearanceColors}
                onEdgeSnapChange={updateEdgeSnapEnabled}
                onStandbyLineVisibleChange={updateStandbyLineVisible}
                onLaunchAtLoginChange={updateLaunchAtLogin}
                onSystemNotificationsChange={updateSystemNotifications}
                onOperationHintsChange={updateOperationHints}
                onAutoCacheOptimizationChange={updateAutoCacheOptimization}
                onQuickActionGlobalEnabledChange={updateQuickActionGlobalEnabled}
                onShortcutActionsChange={updateShortcutActions}
                onShortcutCaptureStart={beginShortcutCapture}
                onShortcutCaptureEnd={endShortcutCapture}
                onQuickActionsExpandedChange={setQuickActionsExpanded}
                onQuickCommandsExpandedChange={setQuickCommandsExpanded}
                onSkimDisplayChange={updateSkimDisplay}
                onSearch={() => {
                  if (submitQuickCommandIfNeeded(search)) {
                    return;
                  }
                  setShellState("normal");
                  void runSearch(search);
                }}
                onStartAdd={addDirectory}
                onUpdateAll={scanAllDirectories}
                onRecognizeDirectory={scanDirectory}
                onContinueRecognition={continueRecognition}
                onCancelRecognition={cancelRecognition}
                onRetryIndex={retryIndexTask}
                onLlamaRuntimeChange={updateSelectedLlamaRuntime}
                onRefreshLlamaRuntime={refreshLlamaRuntimeSettings}
                onGgufModelChange={updateSelectedGgufModel}
                onRefreshGgufModels={refreshGgufModelSettings}
                onStartLlamaRuntime={startLlamaRuntimeServer}
                onStopLlamaRuntime={stopLlamaRuntimeServer}
                onClearCache={requestClearThumbnailCache}
                onClearSkimCache={requestClearSkimCache}
                onOpenIndexView={openIndexView}
                onEditDirectory={setEditingDirectoryId}
                onCancelDirectoryEdit={() => setEditingDirectoryId(null)}
                onDirectoryNameChange={updateDirectoryName}
                onDeleteDirectory={(id) => {
                  setDirectoryToDelete(id);
                  setDialog("deleteDirectory");
                }}
              />
            )}
            {skimLocationPickerOpen && showShellSettingsToggle && dialog === null && (
              <SkimLocationPicker
                activeView={activeView}
                locations={skimSystemLocationsCollapsed
                  ? skimLocations.filter((location) => location.kind === "computer" || location.kind === "desktop" || location.kind === "starred")
                  : skimLocations}
                inSkim={view === "skim"}
                closing={skimLocationPickerClosing}
                systemLocationsCollapsed={skimSystemLocationsCollapsed}
                onSelect={(path) => closeSkimLocationPicker(() => openSkimAtLocation(path))}
                onDismiss={closeSkimLocationPicker}
                onExit={handleSkimLocationPickerExit}
                onToggleSystemLocations={() => void toggleSkimSystemLocations()}
                menuStyle={contextMenuStyle}
                onRemoveSidebarFolder={(path) => void removeSkimSidebarFolder(path)}
              />
            )}
          </div>
        </>
      )}
      {contextMenu && (
        <ImageContextMenu
          key={`results:${contextMenu.item.id}:${contextMenu.x}:${contextMenu.y}`}
          x={contextMenu.x}
          y={contextMenu.y}
          theme={effectiveTheme}
          menuStyle={contextMenuStyle}
          compact={contextMenu.shellState === "micro" || contextMenu.shellState === "mini"}
          header={{
            format: contextMenu.item.extension.slice(1).toUpperCase() || t("fileInfo.file"),
            fileName: contextMenu.item.fileName,
            primaryDetail: t("fileInfo.size", { size: formatCacheSize(contextMenu.item.fileSize) }),
            details: [
              ...(contextMenu.item.imageWidth > 0 && contextMenu.item.imageHeight > 0
                ? [t("fileInfo.resolution", { width: contextMenu.item.imageWidth, height: contextMenu.item.imageHeight })]
                : [])
            ]
          }}
          groups={[
            {
              id: "view",
              label: t("context.view"),
              actions: [
                { id: "preview", label: t("preview.action"), onSelect: contextMenu.preview },
                { id: "open", label: t("context.open"), onSelect: () => void invokeFileAction("open", contextMenu.item) },
                { id: "showInFolder", label: t("context.showInFolder"), onSelect: () => void invokeFileAction("showInFolder", contextMenu.item) }
              ]
            },
            {
              id: "actions",
              label: t("context.actions"),
              actions: [
                {
                  id: "copyPaths",
                  label: contextMenu.items.length > 1
                    ? t("context.copySelectedPaths", { count: contextMenu.items.length })
                    : t("context.copyPath"),
                  onSelect: () => {
                    setContextMenu(null);
                    void window.imageEverything?.files.copyPaths(contextMenu.items.map((item) => item.filePath));
                  }
                },
                ...(contextMenu.items.length > 0
                  ? [
                    {
                      id: "editKeywords",
                      label: t("context.editKeywords"),
                      onSelect: () => requestEditKeywords(contextMenu.items)
                    },
                    {
                      id: "delete",
                      label: contextMenu.items.length > 1 ? t("context.deleteSelectedFiles", { count: contextMenu.items.length }) : t("context.deleteFile"),
                      onSelect: () => requestDeleteFiles(contextMenu.items)
                    }
                  ] satisfies ImageContextMenuGroup["actions"]
                  : [])
              ]
            }
          ]}
        />
      )}
      {dialog === "editKeywords" && keywordEditSession && (
        <KeywordEditorCard
          session={keywordEditSession}
          keywords={editKeywords}
          error={editMetadataError}
          isSaving={isSavingMetadata}
          isClosing={isKeywordEditorClosing}
          menuStyle={contextMenuStyle}
          theme={effectiveTheme}
          onKeywordsChange={setEditKeywords}
          onSave={saveEditedKeywords}
          onCancel={cancelEditKeywords}
          onExitComplete={finishKeywordEditorClose}
        />
      )}
    </div>
  );
};



export default App;
