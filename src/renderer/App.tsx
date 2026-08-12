import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type ReactNode, type Ref, type RefObject } from "react";
import { createPortal } from "react-dom";
import iconSignatureCap7CESvg from "./assets/icons/icon-signature-cap7ce.svg?raw";
import iconSortAscSvg from "./assets/icons/icon-sort-asc.svg?raw";
import iconSortDescSvg from "./assets/icons/icon-sort-desc.svg?raw";
import iconSkimSvg from "./assets/icons/icon-skim.svg?raw";
import skimDiskSvg from "./assets/icons/skim-disk.svg?raw";
import skimFileSvg from "./assets/icons/skim-file.svg?raw";
import skimFolderSvg from "./assets/icons/skim-folder.svg?raw";
import warningGradientSvg from "./assets/icons/warning-gradient.svg?raw";
import WaitingIndicator from "./WaitingIndicator";
import ColorPickerPopover from "./ColorPickerPopover";
import { executeQuickCommand } from "./commandExecutor";
import type { QuickCommandConfirmationRequest } from "./commandExecutor";
import { parseQuickCommand } from "./commandParser";
import CustomScrollbar from "./CustomScrollbar";
import ImageContextMenu, { getImageContextMenuStyle, splitMiddleEllipsisFileName, type ImageContextMenuGroup } from "./ImageContextMenu";
import {
  centerFloatingCardPosition,
  createSpaceReleaseGuard,
  createSpaceHoldController,
  getKeywordEditorTextareaMaximumHeight,
  getKeywordEditorExitDelay,
  isKeywordEditorCancelKey,
  isPlainSpaceShortcut,
  shouldSubmitKeywordEditor,
} from "./keywordEditorInteraction";
import { createPreviewRequestGuard } from "./previewRequestGuard";
import WindowControlRail, { type WindowControlAction } from "./WindowControlRail";
import type {
  AiIndexProgress,
  AppView,
  AppearanceColors,
  DirectoryAddResult,
  DirectoryItem,
  FilePreviewKind,
  GgufModelSettings,
  ImageIndexItem,
  ImageSearchResponse,
  IndexQualityStats,
  LanguagePreference,
  LlamaRuntimeProcessState,
  LlamaRuntimeSettings,
  PreviewWindowData,
  RecognitionStatusFilter,
  ResolvedThemeMode,
  SearchLabelVisibilityPreferences,
  SearchState,
  ShortcutActionId,
  ShortcutActionPreferences,
  ShortcutActionsUpdateResult,
  ShortcutAvailabilityResult,
  SkimBreadcrumb,
  SkimBrowseEntry,
  SkimBrowseOptions,
  SkimDisplayMode,
  SkimDisplayPreferences,
  SkimFolderStats,
  SkimPreviewInfo,
  SkimTextPreview,
  SortDirection,
  SortField,
  ThumbnailOptimizationStatus,
  VisualCacheStats,
  ThemeMode
} from "../shared/types";
import { getActiveLanguage, resolveLanguagePreference, setActiveLanguage, t, type TranslationKey } from "../../electron/localization";
import { fileFormatCapabilities, fileFormatCapabilityByExtension, skimDefaultFileExtensionSet, skimCuratedFileExtensionSet, type FileFormatCategory } from "../../electron/formatCapabilities";

const skimFormatIconModules = import.meta.glob<string>("./assets/icons/format-*.svg", {
  eager: true,
  query: "?raw",
  import: "default"
});
const skimFormatIconSvgByName = Object.fromEntries(
  Object.entries(skimFormatIconModules).map(([assetPath, svg]) => [
    assetPath.slice(assetPath.lastIndexOf("/") + 1, -4),
    svg
  ])
) as Record<string, string>;

const settingsFormatCategoryOrder: readonly FileFormatCategory[] = [
  "visual",
  "video",
  "audio",
  "text",
  "document",
  "project",
  "threeD",
  "archive",
  "data",
  "font",
  "model"
];

const settingsFormatCategoryOverrides: ReadonlyMap<string, FileFormatCategory> = new Map([
  [".pdf", "document"],
  [".rtf", "document"],
  [".psd", "project"],
  [".psb", "project"],
  [".ai", "project"],
  [".cdr", "project"]
]);

const getFormatIconSvg = (extension: string, iconName = "") => {
  const normalizedExtension = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  const resolvedIconName = fileFormatCapabilityByExtension.get(normalizedExtension)?.iconName ?? iconName;
  return skimFormatIconSvgByName[resolvedIconName] ?? skimFileSvg;
};

const resolveFileContentPreview = async (filePath: string, previewKind: FilePreviewKind): Promise<{
  provider: "fileInfo" | "text" | "audio" | "video" | "pdf" | "office" | "archive" | "font" | "epub" | "mobi";
  previewUrl: string;
  textPreview?: SkimTextPreview;
}> => {
  if (previewKind === "text") {
    try {
      const textPreview = await window.imageEverything?.skim.readTextPreview(filePath);
      if (textPreview) return { provider: "text", previewUrl: "", textPreview };
    } catch {
      return { provider: "fileInfo", previewUrl: "" };
    }
  }
  if (previewKind === "audio" || previewKind === "video") {
    return {
      provider: previewKind,
      previewUrl: `cap7ce://skim-media/?path=${encodeURIComponent(filePath)}`
    };
  }
  if (previewKind === "pdf") {
    return { provider: "pdf", previewUrl: "" };
  }
  if (previewKind === "office") {
    return { provider: "office", previewUrl: "" };
  }
  if (previewKind === "archive") {
    return { provider: "archive", previewUrl: "" };
  }
  if (previewKind === "font") {
    return { provider: "font", previewUrl: "" };
  }
  if (previewKind === "epub") return { provider: "epub", previewUrl: "" };
  if (previewKind === "mobi") return { provider: "mobi", previewUrl: "" };
  return { provider: "fileInfo", previewUrl: "" };
};

type ShellState = "standby" | "capsule" | "micro" | "mini" | "normal" | "settings";
type ShellTransition = {
  from: ShellState;
  to: ShellState;
};
type SearchCapsuleLabelVisibility = SearchLabelVisibilityPreferences;
type Cap7CEWindowBounds = { x: number; y: number; width: number; height: number };
type DialogName = "addDroppedDirectories" | "deleteDirectory" | "replaceDirectories" | "deleteFiles" | "editKeywords" | "clearCache" | "clearSkimCache" | null;
type DroppedDirectory = {
  name: string;
  path: string;
};

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
type KeywordEditSession = {
  mode: "single" | "multi";
  items: ImageIndexItem[];
  initialCommonKeywords: string[];
};
type DeleteFilesFeedback = {
  status: "failed" | "succeeded";
  failedCount: number;
  message: string;
};
type CacheClearFeedback = {
  status: "failed" | "succeeded";
  message: string;
};
type IndexTaskRequest =
  | { kind: "all" }
  | { kind: "directory"; directoryId: string }
  | { kind: "continue" };
type ScanSummary = {
  imageCount: number;
  scanResultPath: string;
  aiCompleted: number;
  aiFailed: number;
  aiTotal: number;
};

type KeywordEditScrollSnapshot = {
  offset: number;
  shellState: Extract<ShellState, "micro" | "mini" | "normal">;
  search: SearchState;
};
type ResultLayoutMode = "micro" | "mini" | "normal";
type SpacePressSnapshot = {
  index: number;
  items: ImageIndexItem[];
};
type SkimReturnContext = {
  view: Exclude<AppView, "skim">;
  shellState: ShellState;
};

const imageGridGap = 5;
const imageGridOverscanRows = 2;
const imageGridOverscanItems = 10;
const gridInteractionResumeDelayMs = 240;
let gridInteractionResumeTimer: number | null = null;

const notifyGridInteraction = () => {
  void window.imageEverything?.cache.setGridInteractionActive(true);
  if (gridInteractionResumeTimer !== null) {
    window.clearTimeout(gridInteractionResumeTimer);
  }
  gridInteractionResumeTimer = window.setTimeout(() => {
    gridInteractionResumeTimer = null;
    void window.imageEverything?.cache.setGridInteractionActive(false);
  }, gridInteractionResumeDelayMs);
};
const microVisibleThumbCount = 5;
const miniDefaultColumnCount = 2;
const imageGridTargetThumbSize = 150;
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
const viewportMenuGap = 5;
const DEBUG_WINDOW_BOUNDS = false;

const getResultLayoutMode = (shellState: ShellState): ResultLayoutMode => (
  shellState === "micro" ? "micro" : shellState === "mini" ? "mini" : "normal"
);

const getCommonKeywords = (items: ImageIndexItem[]) => {
  if (items.length === 0) return [];
  const firstKeywords = items[0].keywords.filter((keyword, index, keywords) => keywords.indexOf(keyword) === index);
  const remainingKeywordSets = items.slice(1).map((item) => new Set(item.keywords));
  return firstKeywords.filter((keyword) => remainingKeywordSets.every((keywords) => keywords.has(keyword)));
};

const getImageGridLayout = (layoutMode: ResultLayoutMode, viewportWidth: number, viewportHeight: number) => {
  const contentWidth = Math.max(0, viewportWidth);
  const isHorizontal = layoutMode === "micro";

  if (isHorizontal) {
    const columnCount = microVisibleThumbCount;
    const cellSize = Math.max(0, viewportHeight);
    return { cellSize, columnCount, contentWidth, isHorizontal };
  }

  const adaptiveColumnCount = Math.max(
    1,
    Math.floor((contentWidth + imageGridGap) / (imageGridTargetThumbSize + imageGridGap))
  );
  const columnCount = Math.max(layoutMode === "mini" ? miniDefaultColumnCount : 1, adaptiveColumnCount);
  const cellSize = Math.max(0, (contentWidth - (columnCount - 1) * imageGridGap) / columnCount);
  return { cellSize, columnCount, contentWidth, isHorizontal };
};

const formatCompactExtensionLabel = (extension: string, maximumLength = 7) => {
  const label = extension.slice(1).toUpperCase();
  if (label.length <= maximumLength) return label;
  const visibleLength = maximumLength - 1;
  const leadingLength = Math.ceil(visibleLength / 2);
  return `${label.slice(0, leadingLength)}…${label.slice(-Math.floor(visibleLength / 2))}`;
};

const SvgIcon = ({ svg, className = "cap-svg-icon" }: { svg: string; className?: string }) => (
  <span className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
);

const ThumbnailContent = ({ thumbnailUrl, fallback }: { thumbnailUrl: string; fallback: ReactNode }) => {
  const [showPlaceholder, setShowPlaceholder] = useState(!thumbnailUrl);

  useEffect(() => {
    setShowPlaceholder(!thumbnailUrl);
  }, [thumbnailUrl]);

  return showPlaceholder ? fallback : (
    <span className="thumbnail-image-frame">
      <img
        src={thumbnailUrl}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={(event) => {
          event.currentTarget.style.display = "none";
          setShowPlaceholder(true);
        }}
      />
    </span>
  );
};

const UnrecognizedThumbnail = ({ item }: { item: ImageIndexItem }) => (
  <span className="unrecognized-thumbnail">
    <ThumbnailContent
      thumbnailUrl={item.thumbnailUrl}
      fallback={<SvgIcon svg={getFormatIconSvg(item.extension, item.iconName)} className="cap-svg-icon unrecognized-format-icon" />}
    />
  </span>
);

const areImageIdSetsEqual = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>
) => left.size === right.size && [...left].every((imageId) => right.has(imageId));

const getScrollTopToRevealItem = (
  container: HTMLElement,
  itemTop: number,
  itemHeight: number,
  edgeInset: number
) => {
  const currentTop = container.scrollTop;
  const visibleTop = currentTop + edgeInset;
  const visibleBottom = currentTop + container.clientHeight - edgeInset;
  const itemBottom = itemTop + itemHeight;

  if (itemTop < visibleTop) {
    return Math.max(0, itemTop - edgeInset);
  }

  if (itemBottom > visibleBottom) {
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    return Math.min(maxScrollTop, Math.max(0, itemBottom - container.clientHeight + edgeInset));
  }

  return currentTop;
};

const getScrollLeftToRevealItem = (
  container: HTMLElement,
  itemLeft: number,
  itemWidth: number,
  edgeInset: number
) => {
  const currentLeft = container.scrollLeft;
  const visibleLeft = currentLeft + edgeInset;
  const visibleRight = currentLeft + container.clientWidth - edgeInset;
  const itemRight = itemLeft + itemWidth;

  if (itemLeft < visibleLeft) {
    return Math.max(0, itemLeft - edgeInset);
  }

  if (itemRight > visibleRight) {
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    return Math.min(maxScrollLeft, Math.max(0, itemRight - container.clientWidth + edgeInset));
  }

  return currentLeft;
};

type MenuPointerPosition = { x: number; y: number };
type ViewportMenuPosition = { left: number; top: number };

const clampMenuPositionToViewport = (
  pointerX: number,
  pointerY: number,
  menuWidth: number,
  menuHeight: number
): ViewportMenuPosition => ({
  left: Math.min(Math.max(pointerX, viewportMenuGap), window.innerWidth - menuWidth - viewportMenuGap),
  top: Math.min(Math.max(pointerY, viewportMenuGap), window.innerHeight - menuHeight - viewportMenuGap)
});

const useMeasuredViewportMenuPosition = (
  pointerPosition: MenuPointerPosition | null,
  menuRef: RefObject<HTMLElement | null>,
  measurementKey: string
) => {
  const [measuredPosition, setMeasuredPosition] = useState<(ViewportMenuPosition & { key: string }) | null>(null);

  useLayoutEffect(() => {
    if (!pointerPosition || !menuRef.current) {
      setMeasuredPosition(null);
      return;
    }

    const menuBounds = menuRef.current.getBoundingClientRect();
    const nextPosition = clampMenuPositionToViewport(
      pointerPosition.x,
      pointerPosition.y,
      menuBounds.width,
      menuBounds.height
    );
    setMeasuredPosition({ ...nextPosition, key: measurementKey });
  }, [measurementKey, menuRef, pointerPosition?.x, pointerPosition?.y]);

  return measuredPosition?.key === measurementKey ? measuredPosition : null;
};

const getDirectoryPath = (filePath: string) => {
  const normalizedPath = filePath.replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(normalizedPath.lastIndexOf("\\"), normalizedPath.lastIndexOf("/"));
  if (separatorIndex < 0) {
    return "";
  }
  if (separatorIndex === 2 && /^[A-Za-z]:[\\/]/.test(normalizedPath)) {
    return normalizedPath.slice(0, 3);
  }
  return normalizedPath.slice(0, Math.max(1, separatorIndex));
};

const emptyIndexQualityStats: IndexQualityStats = {
  totalImages: 0,
  recognizedImages: 0,
  unrecognizedImages: 0
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

const getSortLabels = (): Record<SortField, string> => ({
  file_name: t("sort.field.name"),
  modified_at: t("sort.field.modifiedAt")
});

const getSortDirectionLabels = (): Record<SortDirection, string> => ({
  asc: t("sort.direction.asc"),
  desc: t("sort.direction.desc")
});

const getRecognitionStatusLabels = (): Record<RecognitionStatusFilter, string> => ({
  all: t("filter.allFiles"),
  recognized: t("filter.recognized"),
  unrecognized: t("filter.unrecognized")
});

const getSettingsThemeLabels = (): Record<ThemeMode, string> => ({
  system: t("theme.system"),
  light: t("theme.light"),
  dark: t("theme.dark")
});

const defaultAppearanceColors: AppearanceColors = {
  themeColor: "#7C93F3",
  accentColor: "#68C3C0"
};

const getNextThemeMode = (currentTheme: ThemeMode): ThemeMode => {
  if (currentTheme === "system") return "light";
  if (currentTheme === "light") return "dark";
  return "system";
};

const getNextLanguagePreference = (currentLanguage: LanguagePreference): LanguagePreference => {
  if (currentLanguage === "system") return "zh-CN";
  if (currentLanguage === "zh-CN") return "en-US";
  return "system";
};

const getLanguagePreferenceLabel = (language: LanguagePreference) => {
  if (language === "zh-CN") return t("language.zhCN");
  if (language === "en-US") return t("language.enUS");
  return t("language.system");
};

const isHexColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

const getTextColorForBackground = (color: string) => {
  if (!isHexColor(color)) return "#191919";
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const brightness = red * 0.299 + green * 0.587 + blue * 0.114;
  return brightness > 160 ? "#191919" : "#ffffff";
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

const getLlamaRuntimeStatusLabel = (settings: LlamaRuntimeSettings) => {
  if (settings.status === "available") return t("common.available");
  if (settings.status === "unselected") return t("common.unselected");
  if (settings.status === "missing_root") return t("runtime.rootMissing");
  if (settings.status === "missing_server") return t("runtime.noneFound");
  return t("runtime.selectionMissing");
};

const getLlamaRuntimeProcessStatusLabel = (state: LlamaRuntimeProcessState) => {
  if (state.status === "starting") return t("common.starting");
  if (state.status === "running") return t("common.running");
  if (state.status === "failed") return t("runtime.startFailed");
  return t("common.stopped");
};

const getGgufModelStatusLabel = (
  settings: GgufModelSettings,
  processState: LlamaRuntimeProcessState
) => {
  const processMatchesSelection = processState.selectedModelId === settings.selectedModelId;
  if (processMatchesSelection && processState.modelStatus === "loading") return t("common.loading");
  if (processMatchesSelection && processState.modelStatus === "loaded") return t("common.loaded");
  if (processMatchesSelection && processState.modelStatus === "load_failed") return t("common.loadFailed");
  if (settings.status === "unpaired") return t("model.unpaired");
  if (settings.status === "ready") return t("model.paired");
  if (settings.status === "selection_missing") return t("model.selectionMissing");
  if (settings.status === "missing_directory") return t("model.directoryMissing");
  return t("common.unselected");
};

const joinDisplayPath = (root: string, relativePath?: string) => {
  if (!root || !relativePath) return t("common.unselected");
  return `${root.replace(/[\\/]+$/, "")}\\${relativePath.replace(/\//g, "\\")}`;
};

const emptySearch: SearchState = {
  query: "",
  directoryId: "all",
  fileFormat: "all",
  sortField: "file_name",
  sortDirection: "desc",
  recognitionStatus: "all"
};

const defaultShortcutActions: ShortcutActionPreferences = {
  activateCapsule: "Alt+`",
  activateMicro: "Alt+1",
  activateMini: "Alt+2",
  activateNormal: "Alt+3",
  activateStandby: "Alt+4",
  activateSkim: "Alt+5",
  cycleDirectory: "Alt+Q",
  openSettings: "Alt+6"
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

const getShortcutActionItems = (): Array<{ id: ShortcutActionId; name: string }> => [
  { id: "activateCapsule", name: t("shortcut.activateCapsule") },
  { id: "activateMicro", name: t("shortcut.activateMicro") },
  { id: "activateMini", name: t("shortcut.activateMini") },
  { id: "activateNormal", name: t("shortcut.activateNormal") },
  { id: "activateStandby", name: t("shortcut.activateLine") },
  { id: "activateSkim", name: t("shortcut.activateSkim") },
  { id: "openSettings", name: t("shortcut.openSettings") },
  { id: "cycleDirectory", name: t("shortcut.cycleDirectory") }
];

const getQuickCommandGroups = (): Array<{
  title: string;
  items: Array<{ command: string; description: string }>;
}> => [
  {
    title: t("commands.group.skim"),
    items: [
      { command: "skim:", description: t("commands.skim.open") },
      { command: "skim:root", description: t("commands.skim.root") }
    ]
  },
  {
    title: t("commands.group.settings"),
    items: [
      { command: "set:", description: t("commands.set.open") },
      { command: "set:quick", description: t("commands.set.quick") },
      { command: "set:cmd", description: t("commands.set.commands") }
    ]
  },
  {
    title: t("commands.group.view"),
    items: [
      { command: "see:all", description: t("commands.view.all") },
      { command: "see:indexed", description: t("commands.view.recognized") },
      { command: "see:unindexed", description: t("commands.view.unrecognized") },
      { command: t("commands.example.viewDirectory"), description: t("commands.view.directory") }
    ]
  },
  {
    title: t("commands.group.window"),
    items: [
      { command: "win:line", description: t("commands.window.line") },
      { command: "win:cap", description: t("commands.window.capsule") },
      { command: "win:micro", description: t("commands.window.micro") },
      { command: "win:mini", description: t("commands.window.mini") },
      { command: "win:normal", description: t("commands.window.normal") },
      { command: "win:max", description: t("commands.window.max") },
      { command: "win:top on", description: t("commands.window.pin") },
      { command: "win:top off", description: t("commands.window.unpin") }
    ]
  },
  {
    title: t("commands.group.tags"),
    items: [
      { command: "tag:dir", description: t("commands.tags.showDirectory") },
      { command: t("commands.example.selectDirectory"), description: t("commands.tags.selectDirectory") },
      { command: "tag:sort", description: t("commands.tags.showSort") },
      { command: "tag:sort asc", description: t("commands.tags.sortAsc") },
      { command: "tag:sort desc", description: t("commands.tags.sortDesc") },
      { command: "tag:show all", description: t("commands.tags.showAll") },
      { command: "tag:hide all", description: t("commands.tags.hideAll") },
      { command: "tag:hide dir", description: t("commands.tags.hideDirectory") },
      { command: "tag:hide sort", description: t("commands.tags.hideSort") }
    ]
  },
  {
    title: t("commands.group.index"),
    items: [
      { command: "idx:all", description: t("commands.index.all") },
      { command: t("commands.example.indexDirectory"), description: t("commands.index.directory") },
      { command: "idx:continue", description: t("commands.index.continue") },
      { command: "idx:stop", description: t("commands.index.stop") }
    ]
  },
  {
    title: t("commands.group.directory"),
    items: [
      { command: t("commands.example.addDirectory"), description: t("commands.directory.add") },
      { command: t("commands.example.renameDirectory"), description: t("commands.directory.rename") },
      { command: "dir:refresh", description: t("commands.directory.refresh") }
    ]
  },
  {
    title: t("commands.group.appearance"),
    items: [
      { command: "ui:light", description: t("commands.appearance.light") },
      { command: "ui:dark", description: t("commands.appearance.dark") },
      { command: "ui:auto", description: t("commands.appearance.system") },
      { command: "ui:main #RRGGBB", description: t("commands.appearance.themeColor") },
      { command: "ui:accent #RRGGBB", description: t("commands.appearance.accentColor") },
      { command: "ui:reset", description: t("commands.appearance.reset") }
    ]
  },
  {
    title: t("commands.group.appBehavior"),
    items: [
      { command: "app:startup on", description: t("commands.app.startupEnable") },
      { command: "app:startup off", description: t("commands.app.startupDisable") },
      { command: "app:hints on", description: t("commands.app.hintsEnable") },
      { command: "app:hints off", description: t("commands.app.hintsDisable") }
    ]
  },
  {
    title: t("commands.group.line"),
    items: [
      { command: "line:on", description: t("commands.line.show") },
      { command: "line:off", description: t("commands.line.hide") }
    ]
  },
  {
    title: t("commands.group.edgeSnap"),
    items: [
      { command: "edge:on", description: t("commands.edgeSnap.enable") },
      { command: "edge:off", description: t("commands.edgeSnap.disable") }
    ]
  },
  {
    title: t("commands.group.shortcuts"),
    items: [
      { command: "key:global on", description: t("commands.shortcuts.enable") },
      { command: "key:global off", description: t("commands.shortcuts.disable") },
      { command: "key:reset", description: t("commands.shortcuts.reset") }
    ]
  },
  {
    title: t("commands.group.commands"),
    items: [
      { command: "cmd:on", description: t("commands.parser.enable") },
      { command: "cmd:off", description: t("commands.parser.disable") }
    ]
  },
  {
    title: t("commands.group.language"),
    items: [
      { command: "lang:auto", description: t("commands.language.system") },
      { command: "lang:cn", description: t("commands.language.chinese") },
      { command: "lang:en", description: t("commands.language.english") }
    ]
  },
  {
    title: t("commands.group.runtime"),
    items: [
      { command: "llama:start", description: t("commands.runtime.start") },
      { command: t("commands.example.selectRuntime"), description: t("commands.runtime.select") },
      { command: "llama:refresh", description: t("commands.runtime.refresh") }
    ]
  },
  {
    title: t("commands.group.model"),
    items: [
      { command: "model:refresh", description: t("commands.model.refresh") },
      { command: t("commands.example.selectModel"), description: t("commands.model.select") }
    ]
  },
  {
    title: t("commands.group.cache"),
    items: [
      { command: "cache:thumb", description: t("commands.cache.thumbnail") },
      { command: "cache:preview", description: t("commands.cache.preview") },
      { command: "cache:model", description: t("commands.cache.model") },
      { command: "cache:skim", description: t("commands.cache.skim") }
    ]
  }
];

const getDangerousQuickCommandItems = () => [
  { command: t("commands.example.deleteDirectory"), description: t("commands.confirm.deleteDirectory") },
  { command: "idx:clear all", description: t("commands.confirm.clearIndex") },
  { command: "app:quit", description: t("commands.confirm.quit") },
  { command: "llama:stop", description: t("commands.confirm.stopRuntime") },
  { command: "cache:clear", description: t("commands.confirm.clearCache") },
  { command: "cache:skim", description: t("commands.confirm.clearSkimCache") }
];

const normalizeShortcutActions = (shortcutActions?: Partial<ShortcutActionPreferences>): ShortcutActionPreferences => ({
  activateCapsule: shortcutActions?.activateCapsule || defaultShortcutActions.activateCapsule,
  activateMicro: shortcutActions?.activateMicro || defaultShortcutActions.activateMicro,
  activateMini: shortcutActions?.activateMini || defaultShortcutActions.activateMini,
  activateNormal: shortcutActions?.activateNormal || defaultShortcutActions.activateNormal,
  activateStandby: shortcutActions?.activateStandby || defaultShortcutActions.activateStandby,
  activateSkim: shortcutActions?.activateSkim || defaultShortcutActions.activateSkim,
  cycleDirectory: shortcutActions?.cycleDirectory || defaultShortcutActions.cycleDirectory,
  openSettings: shortcutActions?.openSettings || defaultShortcutActions.openSettings
});

const formatShortcutLabel = (shortcut: string) => shortcut
  .split("+")
  .map((part) => part.trim())
  .filter(Boolean)
  .join(" + ");

const getShortcutFromKeyboardEvent = (event: KeyboardEvent) => {
  const keyMap: Record<string, string> = {
    Escape: "Esc",
    " ": "Space",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right"
  };
  const ignoredKeys = new Set(["Alt", "Control", "Shift", "Meta"]);
  if (ignoredKeys.has(event.key)) return null;

  const key = keyMap[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  parts.push(key);
  return parts.join("+");
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

const toFullImageUrl = (filePath: string) => `cap7ce://image/?path=${encodeURIComponent(filePath)}`;

const isEditableKeyboardTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
};

const formatDisplayMessage = (message?: string) => {
  if (!message) {
    return "";
  }

  return message.replace(/fetch\s*failed/gi, t("error.connectionFailed"));
};

const formatCacheSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
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
  const searchTaskIdRef = useRef<string | null>(null);
  const viewDisplaySearchTimerRef = useRef<number | null>(null);
  const skimTaskIdRef = useRef<string | null>(null);
  const skimVisualSessionIdRef = useRef<string | null>(null);
  const [skimVisualSessionId, setSkimVisualSessionId] = useState("");
  const skimReturnContextRef = useRef<SkimReturnContext | null>(null);
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
    ).then(() => syncAlwaysOnTop());
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
        cancelSkimRead();
        clearSkimFeedback();
        skimReturnContextRef.current = null;
        setSkimEntries([]);
        setSkimCurrentPath(null);
        setSkimBreadcrumbs([]);
        resetShellBehaviorState();
        resetSettingsViewState(true);
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
  }, [cancelSkimRead, clearSkimFeedback, resetSettingsViewState, resetShellBehaviorState, syncAlwaysOnTop]);

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
        const shortcutAvailability = await window.imageEverything?.preferences.shortcutAvailability();
        if (isMounted) {
          setDirectories(loadedDirectories);
          if (missingFileCountIds.length > 0) {
            void window.imageEverything?.directories.refreshFileCounts(missingFileCountIds).then((countedDirectories) => {
              if (isMounted && countedDirectories) setDirectories(countedDirectories);
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

  useEffect(() => {
    const unsubscribe = window.imageEverything?.window.onShowAllFilesRequested?.(() => {
      showCommandResults({ ...getCommandBaseSearch(), query: "", directoryId: "all", fileFormat: "all", recognitionStatus: "all" });
    });
    return () => unsubscribe?.();
  }, [showCommandResults]);

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
      resetSettingsViewState(true);
      setShellState("standby");
      closeNavigationOverlays();
      return;
    }

    if (mode === "cap") {
      resetSettingsViewState(true);
      setShellState("capsule");
      return;
    }

    resetSettingsViewState(true);
    const nextShellState = mode;
    if (nextShellState === "micro") {
      void window.imageEverything?.window.setShellState("micro", { forceBounds: true });
    }
    setShellState(nextShellState);
    if (!resultsInitializedRef.current) {
      const nextSearch = { ...getCommandBaseSearch(), query: "", recognitionStatus: "all" as const };
      setSearch(nextSearch);
      void runSearch(nextSearch);
    }
  };

  useEffect(() => {
    const unsubscribe = window.imageEverything?.window.onActivateShellModeShortcut?.((mode) => {
      setCommandShellMode(mode === "standby" ? "line" : mode);
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
    if (submitQuickCommandIfNeeded(nextSearch)) {
      return;
    }

    void runSearch(nextSearch);
  };

  const openResults = () => {
    const nextSearch = { ...search, recognitionStatus: "all" as const };
    setSearch(nextSearch);
    submitSearch(nextSearch);
  };

  const activateStandbyCapsule = useCallback(() => {
    setShellState((currentShellState) => currentShellState === "standby" ? "capsule" : currentShellState);
  }, []);

  const collapseShellToStandby = useCallback(() => {
    resetShellBehaviorState();
    resetSettingsViewState(true);
    setShellState("standby");
    closeNavigationOverlays();
  }, [closeNavigationOverlays, resetSettingsViewState, resetShellBehaviorState]);

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
        imageCount: result.stats.totalImages,
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

  const closeSkim = useCallback(() => {
    cancelSkimRead();
    void window.imageEverything?.preview.close();
    clearSkimFeedback();
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
      setView(returnContext.view);
      return;
    }
    if (!resultsInitializedRef.current) {
      openResults();
      return;
    }
    setView("results");
    if (shellState !== "micro" && shellState !== "mini" && shellState !== "normal") {
      setShellState("normal");
    }
  }, [cancelSkimRead, clearSkimFeedback, openResults, shellState]);

  const openSkim = useCallback(() => {
    if (view === "skim") {
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
    setView("skim");
    void loadSkimLocation(null);
  }, [loadSkimLocation, shellState, view]);

  const openSkimLocation = useCallback((nextPath: string | null) => {
    void loadSkimLocation(nextPath).then((loaded) => {
      if (loaded) skimForwardPathsRef.current = [];
    });
  }, [loadSkimLocation]);

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
    const unsubscribe = window.imageEverything?.window.onToggleSkimRequested?.(() => {
      if (dialog === "editKeywords") return;
      if (view === "skim") closeSkim();
      else openSkim();
    });
    return () => unsubscribe?.();
  }, [closeSkim, dialog, openSkim, view]);

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
  }, [closeSettings, dialog, navigateBack, navigateForward, navigateSkimBack, navigateSkimForward, openSettings, shellState, view]);

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

        if (view === "results" && selectedResultImageId) {
          setClearSelectionRequestId((requestId) => requestId + 1);
          return;
        }

        if (shellState === "capsule" && search.query.trim().length > 0) {
          setSearch((currentSearch) => ({ ...currentSearch, query: "" }));
          window.setTimeout(() => capsuleInputRef.current?.focus(), 0);
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
    cacheClearFeedback,
    contextMenu,
    cycleSearchDirectory,
    deleteFilesFeedback,
    dialog,
    editingDirectoryId,
    isAddingDirectory,
    isClearingCache,
    isClearingSkimCache,
    isDeletingFiles,
    isSavingMetadata,
    openSkim,
    openSettings,
    pendingQuickCommandConfirmation,
    quickActionGlobalEnabled,
    search,
    selectedResultImageId,
    showQuickCommandNotice,
    shellState,
    skimCacheClearFeedback,
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
        if (shellState === "standby") {
          activateStandbyCapsule();
          return;
        }
        setContextMenu(null);
      }}
    >
      {shellState === "standby" && (
        <button
          className="cap-standby-line"
          type="button"
          aria-label={t("search.expandCapsule")}
          onClick={(event) => {
            event.stopPropagation();
            activateStandbyCapsule();
          }}
        />
      )}
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
      {shellState !== "standby" && (
        <WindowControlRail
          actions={shellControlActions}
          showSkim={showShellSettingsToggle}
          skimActive={view === "skim"}
          skimLabel={shellState === "settings" && settingsOpenedFromSkimRef.current ? t("window.returnSkim") : undefined}
          onSkim={shellState === "settings" && settingsOpenedFromSkimRef.current
            ? closeSettings
            : view === "skim"
              ? closeSkim
              : openSkim}
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
                images={searchResults}
                searchStatus={searchStatus}
                isSearching={isSearching}
                searchError={searchError}
                quickCommandNotice={searchInputFeedback}
                inputFeedbackIsGuide={operationHintVisible}
                directories={directoryOptions}
                directoryName={selectedDirectory.name}
                labelVisibility={searchCapsuleLabelVisibility}
                searchDisplayMode={skimDisplay.searchMode}
                contextMenuTheme={effectiveTheme}
                appearanceColors={appearanceColors}
                imageContextMenuOpen={contextMenu !== null}
                keywordEditorOpen={dialog === "editKeywords"}
                selectedImageId={selectedResultImageId}
                clearSelectionRequestId={clearSelectionRequestId}
                scrollTop={resultScrollPositionsRef.current[search.recognitionStatus]}
                searchInputRef={searchInputRef}
                onSelectedImageChange={setSelectedResultImageId}
                onScrollTopChange={(scrollTop) => {
                  resultScrollPositionsRef.current[search.recognitionStatus] = scrollTop;
                }}
                onSearchChange={(nextSearch) => {
                  clearQuickCommandNotice();
                  updateResultsSearch(nextSearch);
                }}
                onLabelVisibilityChange={updateSearchCapsuleLabelVisibility}
                onSearchDisplayModeChange={(searchMode) => updateSkimDisplay({ ...skimDisplay, searchMode })}
                onSearchOptionsChange={updateResultsSearchOptions}
                onSearch={() => submitSearch(search)}
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

interface HomeViewProps {
  search: SearchState;
  directoryName: string;
  directories: DirectoryItem[];
  labelVisibility: SearchCapsuleLabelVisibility;
  onSearchChange: (search: SearchState) => void;
  onLabelVisibilityChange: (visibility: SearchCapsuleLabelVisibility) => void;
  onSearchOptionsChange: (search: SearchState) => void;
  onSearch: () => void;
}

const HomeView = (props: HomeViewProps) => (
  <main className="home-view cap-home-view">
    <Cap7CESearchCapsule
      search={props.search}
      directoryName={props.directoryName}
      directories={props.directories}
      labelVisibility={props.labelVisibility}
      status="ready"
      unified
      onSearchChange={props.onSearchChange}
      onLabelVisibilityChange={props.onLabelVisibilityChange}
      onSearchOptionsChange={props.onSearchOptionsChange}
      onSearch={props.onSearch}
    />
    <div className="cap-home-signature">
      <span>Cap7CE</span>
      <small>Cap7CE</small>
    </div>
  </main>
);

interface ResultsViewProps {
  shellState: ShellState;
  search: SearchState;
  images: ImageIndexItem[];
  searchStatus: ImageSearchResponse;
  isSearching: boolean;
  searchError: string;
  quickCommandNotice: string;
  inputFeedbackIsGuide: boolean;
  directories: DirectoryItem[];
  directoryName: string;
  labelVisibility: SearchCapsuleLabelVisibility;
  searchDisplayMode: SkimDisplayMode;
  contextMenuTheme: "light" | "dark";
  appearanceColors: AppearanceColors;
  imageContextMenuOpen: boolean;
  keywordEditorOpen: boolean;
  selectedImageId: string | null;
  clearSelectionRequestId: number;
  scrollTop: number;
  searchInputRef?: Ref<HTMLInputElement>;
  onSelectedImageChange: (imageId: string | null) => void;
  onScrollTopChange: (scrollTop: number) => void;
  onSearchChange: (search: SearchState) => void;
  onLabelVisibilityChange: (visibility: SearchCapsuleLabelVisibility) => void;
  onSearchDisplayModeChange: (mode: SkimDisplayMode) => void;
  onSearchOptionsChange: (search: SearchState) => void;
  onSearch: () => void;
  onFeedback: (message: string) => void;
  onEditKeywords: (items: ImageIndexItem[]) => void;
  onContextMenu: (event: React.MouseEvent, item: ImageIndexItem, selectedItems: ImageIndexItem[], preview: () => void) => void;
  onContextMenuClose: () => void;
  onOpenImage: (item: ImageIndexItem) => void;
  onOpenSkim: () => void;
}

const ResultsView = ({ shellState, search, images, searchStatus, isSearching, searchError, quickCommandNotice, inputFeedbackIsGuide, directories, directoryName, labelVisibility, searchDisplayMode, contextMenuTheme, appearanceColors, imageContextMenuOpen, keywordEditorOpen, selectedImageId, clearSelectionRequestId, scrollTop, searchInputRef, onSelectedImageChange, onScrollTopChange, onSearchChange, onLabelVisibilityChange, onSearchDisplayModeChange, onSearchOptionsChange, onSearch, onFeedback, onEditKeywords, onContextMenu, onContextMenuClose, onOpenImage, onOpenSkim }: ResultsViewProps) => {
  const [gridMetrics, setGridMetrics] = useState({ left: 0, right: 0, columnCount: 1 });
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [scrollTargetIndex, setScrollTargetIndex] = useState<number | null>(null);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(
    () => new Set(selectedImageId ? [selectedImageId] : [])
  );
  const selectionAnchorIdRef = useRef<string | null>(selectedImageId);
  const handledClearSelectionRequestIdRef = useRef(clearSelectionRequestId);
  const previewSessionCounterRef = useRef(0);
  const previewOpenRequestRef = useRef(0);
  const previewIndexRef = useRef<number | null>(null);
  const [isSpaceHolding, setIsSpaceHolding] = useState(false);
  const spaceReleaseGuardRef = useRef(createSpaceReleaseGuard());
  const updateGridMetrics = useCallback((nextMetrics: { left: number; right: number; columnCount: number }) => {
    setGridMetrics((currentMetrics) => {
      if (currentMetrics.left === nextMetrics.left && currentMetrics.right === nextMetrics.right && currentMetrics.columnCount === nextMetrics.columnCount) {
        return currentMetrics;
      }
      return nextMetrics;
    });
  }, []);
  const hasSearchTerms = search.query.trim().length > 0;
  const isUnrecognizedView = search.recognitionStatus === "unrecognized";
  const selectedImageIndex = selectedImageId ? images.findIndex((image) => image.id === selectedImageId) : -1;
  const activePreviewIndex = previewIndex !== null && images[previewIndex] ? previewIndex : null;
  const resultStatusContent = isSearching
    ? t("search.searching")
    : isUnrecognizedView
      ? (
        <span className="unrecognized-status">
          <span>{t("search.unrecognizedCount", { count: searchStatus.unrecognizedCount })}</span>
          <span>{t("search.parseFailureCount", { count: searchStatus.failureStats.parseFailures })}</span>
          <span>{t("search.fileFailureCount", { count: searchStatus.failureStats.fileFailures })}</span>
        </span>
      )
      : search.recognitionStatus === "recognized"
        ? t("search.recognizedCount", { count: images.length })
        : hasSearchTerms && searchStatus.skippedUnrecognizedCount > 0
      ? t("search.skippedUnrecognized", { count: images.length, skippedCount: searchStatus.skippedUnrecognizedCount })
      : !hasSearchTerms && searchStatus.unrecognizedCount > 0
        ? (
          <span className="unrecognized-status">
            <span>{t("search.allFileCount", { count: images.length })}</span>
            <span>{t("search.unrecognizedCount", { count: searchStatus.unrecognizedCount })}</span>
          </span>
        )
        : t("search.resultCount", { count: images.length });

  const openPreviewAtIndex = useCallback(async (index: number) => {
    const openRequestId = ++previewOpenRequestRef.current;
    const image = images[index];
    const previewApi = window.imageEverything?.preview;
    if (!image || !previewApi) {
      return;
    }

    onContextMenuClose();
    if (!selectedImageIds.has(image.id)) {
      setSelectedImageIds(new Set([image.id]));
      selectionAnchorIdRef.current = image.id;
    }
    onSelectedImageChange(image.id);
    let previewData: PreviewWindowData;
    if (image.resultKind === "file" || image.previewKind !== "image") {
      try {
        const info = await window.imageEverything?.skim.inspect({ path: image.filePath, kind: "file" });
        if (!info || previewOpenRequestRef.current !== openRequestId) return;
        const contentPreview = await resolveFileContentPreview(image.filePath, image.previewKind);
        if (previewOpenRequestRef.current !== openRequestId) return;
        previewData = {
          sessionId: `${image.id}:${Date.now()}:${++previewSessionCounterRef.current}`,
          itemId: image.id,
          filePath: image.filePath,
          fileName: image.fileName,
          fileSize: image.fileSize,
          previewUrl: contentPreview.previewUrl,
          thumbnailUrl: "",
          provider: contentPreview.provider,
          info,
          textPreview: contentPreview.textPreview,
          skimActive: false,
          theme: contextMenuTheme,
          language: getActiveLanguage(),
          appearanceColors
        };
      } catch {
        return;
      }
    } else {
      previewData = {
        sessionId: `${image.id}:${Date.now()}:${++previewSessionCounterRef.current}`,
        itemId: image.id,
        filePath: image.filePath,
        fileName: image.fileName,
        fileSize: image.fileSize,
        previewUrl: toFullImageUrl(image.filePath),
        thumbnailUrl: image.thumbnailUrl,
        skimActive: false,
        theme: contextMenuTheme,
        language: getActiveLanguage(),
        appearanceColors
      };
    }
    previewIndexRef.current = index;
    setPreviewIndex(index);
    void previewApi.open(previewData).then((opened) => {
      if (!opened) {
        if (previewIndexRef.current === index) {
          previewIndexRef.current = null;
        }
        setPreviewIndex((currentIndex) => currentIndex === index ? null : currentIndex);
      }
    });
  }, [appearanceColors, contextMenuTheme, images, onContextMenuClose, onSelectedImageChange, selectedImageIds]);

  const openPreviewForItem = useCallback((item: ImageIndexItem) => {
    const index = images.findIndex((image) => image.id === item.id);
    if (index >= 0) {
      openPreviewAtIndex(index);
    }
  }, [images, openPreviewAtIndex]);

  const spaceHoldControllerRef = useRef<ReturnType<typeof createSpaceHoldController<SpacePressSnapshot>> | null>(null);
  if (!spaceHoldControllerRef.current) {
    spaceHoldControllerRef.current = createSpaceHoldController<SpacePressSnapshot>({
      delayMs: 350,
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancelScheduled: (handle) => window.clearTimeout(handle as number),
      onShortPress: () => undefined,
      onLongPress: () => undefined
    });
  }
  const spaceHoldController = spaceHoldControllerRef.current;
  spaceHoldController.updateHandlers({
    onShortPress: (snapshot) => {
      setIsSpaceHolding(false);
      openPreviewAtIndex(snapshot.index);
    },
    onLongPress: (snapshot) => {
      setIsSpaceHolding(false);
      spaceReleaseGuardRef.current.activate();
      onEditKeywords(snapshot.items);
    }
  });

  const cancelPendingSpaceHold = useCallback(() => {
    spaceHoldController.cancel();
    setIsSpaceHolding(false);
  }, [spaceHoldController]);

  const cancelSpaceHold = useCallback(() => {
    spaceReleaseGuardRef.current.cancel();
    cancelPendingSpaceHold();
  }, [cancelPendingSpaceHold]);

  useEffect(() => () => {
    spaceReleaseGuardRef.current.cancel();
    spaceHoldController.cancel();
  }, [spaceHoldController]);

  useEffect(() => {
    if (keywordEditorOpen) {
      cancelPendingSpaceHold();
      return;
    }
    cancelSpaceHold();
  }, [cancelPendingSpaceHold, cancelSpaceHold, imageContextMenuOpen, keywordEditorOpen, selectedImageId, shellState]);

  const movePreview = useCallback((direction: -1 | 1) => {
    onContextMenuClose();
    if (images.length === 0) {
      return;
    }
    const baseIndex = activePreviewIndex ?? Math.max(0, selectedImageIndex);
    const nextIndex = Math.min(images.length - 1, Math.max(0, baseIndex + direction));
    if (nextIndex === baseIndex) {
      return;
    }
    openPreviewAtIndex(nextIndex);
  }, [activePreviewIndex, images.length, onContextMenuClose, openPreviewAtIndex, selectedImageIndex]);

  useEffect(() => {
    const unsubscribeNavigate = window.imageEverything?.preview.onNavigate(movePreview);
    const unsubscribeClosed = window.imageEverything?.preview.onClosed(() => {
      previewOpenRequestRef.current += 1;
      const lastPreviewIndex = previewIndexRef.current;
      previewIndexRef.current = null;
      setPreviewIndex(null);
      if (lastPreviewIndex !== null) {
        setScrollTargetIndex(lastPreviewIndex);
      }
    });
    return () => {
      unsubscribeNavigate?.();
      unsubscribeClosed?.();
    };
  }, [movePreview]);

  useEffect(() => {
    const validImageIds = new Set(images.map((image) => image.id));
    const nextSelectedImageIds = new Set(
      [...selectedImageIds].filter((imageId) => validImageIds.has(imageId))
    );

    if (!areImageIdSetsEqual(selectedImageIds, nextSelectedImageIds)) {
      setSelectedImageIds(nextSelectedImageIds);
    }

    if (selectionAnchorIdRef.current && !validImageIds.has(selectionAnchorIdRef.current)) {
      selectionAnchorIdRef.current = null;
    }

    if (!selectedImageId || !nextSelectedImageIds.has(selectedImageId)) {
      const remainingImageIds = [...nextSelectedImageIds];
      const nextActiveImageId = remainingImageIds[remainingImageIds.length - 1] ?? null;
      if (nextActiveImageId !== selectedImageId) {
        onSelectedImageChange(nextActiveImageId);
      }
    }

    if (selectedImageId && !validImageIds.has(selectedImageId)) {
      previewIndexRef.current = null;
      setPreviewIndex(null);
      void window.imageEverything?.preview.close();
      onContextMenuClose();
    }
  }, [images, onContextMenuClose, onSelectedImageChange, selectedImageId, selectedImageIds]);

  useEffect(() => () => onContextMenuClose(), [onContextMenuClose]);

  const selectImageByIndex = useCallback((index: number) => {
    if (images.length === 0) {
      return;
    }

    const safeIndex = Math.min(images.length - 1, Math.max(0, index));
    const imageId = images[safeIndex]?.id ?? null;
    setSelectedImageIds(new Set(imageId ? [imageId] : []));
    selectionAnchorIdRef.current = imageId;
    onSelectedImageChange(imageId);
    setScrollTargetIndex(safeIndex);
    onContextMenuClose();
  }, [images, onContextMenuClose, onSelectedImageChange]);

  const handleImageClick = useCallback((event: React.MouseEvent, item: ImageIndexItem) => {
    const itemIndex = images.findIndex((image) => image.id === item.id);
    if (itemIndex < 0) {
      return;
    }

    if (event.shiftKey) {
      const anchorIndex = selectionAnchorIdRef.current
        ? images.findIndex((image) => image.id === selectionAnchorIdRef.current)
        : -1;
      if (anchorIndex >= 0) {
        const nextSelectedImageIds = event.ctrlKey || event.metaKey
          ? new Set(selectedImageIds)
          : new Set<string>();
        const rangeStart = Math.min(anchorIndex, itemIndex);
        const rangeEnd = Math.max(anchorIndex, itemIndex);
        for (let index = rangeStart; index <= rangeEnd; index += 1) {
          nextSelectedImageIds.add(images[index].id);
        }
        setSelectedImageIds(nextSelectedImageIds);
        onSelectedImageChange(item.id);
        onContextMenuClose();
        return;
      }
    }

    if (event.ctrlKey || event.metaKey) {
      const nextSelectedImageIds = new Set(selectedImageIds);
      if (nextSelectedImageIds.has(item.id)) {
        nextSelectedImageIds.delete(item.id);
        const remainingImageIds = [...nextSelectedImageIds];
        const nextActiveImageId = selectedImageId && nextSelectedImageIds.has(selectedImageId)
          ? selectedImageId
          : remainingImageIds[remainingImageIds.length - 1] ?? null;
        setSelectedImageIds(nextSelectedImageIds);
        onSelectedImageChange(nextActiveImageId);
      } else {
        nextSelectedImageIds.add(item.id);
        setSelectedImageIds(nextSelectedImageIds);
        onSelectedImageChange(item.id);
      }
      selectionAnchorIdRef.current = item.id;
      onContextMenuClose();
      return;
    }

    setSelectedImageIds(new Set([item.id]));
    selectionAnchorIdRef.current = item.id;
    onSelectedImageChange(item.id);
    onContextMenuClose();
  }, [images, onContextMenuClose, onSelectedImageChange, selectedImageId, selectedImageIds]);

  const startFileDrag = useCallback((event: React.DragEvent, item: ImageIndexItem) => {
    event.preventDefault();
    const draggedItems = selectedImageIds.has(item.id)
      ? images.filter((image) => selectedImageIds.has(image.id))
      : [item];
    window.imageEverything?.files.startDrag(
      draggedItems.map((draggedItem) => draggedItem.filePath)
    );
  }, [images, selectedImageIds]);

  const openContextMenuForItem = useCallback((
    event: React.MouseEvent,
    item: ImageIndexItem,
    preview: () => void
  ) => {
    const contextSelectionIds = selectedImageIds.has(item.id)
      ? selectedImageIds
      : new Set([item.id]);
    if (!selectedImageIds.has(item.id)) {
      setSelectedImageIds(contextSelectionIds);
    }
    const contextItems = images.filter((image) => contextSelectionIds.has(image.id));
    selectionAnchorIdRef.current = item.id;
    onSelectedImageChange(item.id);
    onContextMenu(event, item, contextItems, preview);
  }, [images, onContextMenu, onSelectedImageChange, selectedImageIds]);

  const clearResultSelection = useCallback(() => {
    const focusedElement = document.activeElement;
    if (
      focusedElement instanceof HTMLElement &&
      focusedElement.closest(".thumb, .unrecognized-item")
    ) {
      focusedElement.blur();
    }

    setSelectedImageIds((currentSelectedImageIds) => (
      currentSelectedImageIds.size === 0 ? currentSelectedImageIds : new Set()
    ));
    selectionAnchorIdRef.current = null;
    onSelectedImageChange(null);
    setScrollTargetIndex(null);
  }, [onSelectedImageChange]);

  useEffect(() => {
    if (handledClearSelectionRequestIdRef.current === clearSelectionRequestId) {
      return;
    }
    handledClearSelectionRequestIdRef.current = clearSelectionRequestId;
    clearResultSelection();
  }, [clearResultSelection, clearSelectionRequestId]);

  const clearSelectionFromPointerEvent = useCallback((event: PointerEvent) => {
    if (event.button !== 0 || !["micro", "mini", "normal"].includes(shellState)) {
      return;
    }

    const target = event.target;
    const targetElement = target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;

    if (!targetElement) {
      return;
    }

    const inTile = Boolean(targetElement.closest('[data-result-tile="true"]'));
    const inCapsule = Boolean(targetElement.closest('[data-search-capsule="true"]'));
    const inControls = Boolean(targetElement.closest('[data-window-controls="true"], .cap-settings-toggle'));
    const inMenu = Boolean(targetElement.closest('[data-context-menu="true"], .cap7ce-label-menu'));
    const inSettings = Boolean(targetElement.closest('[data-settings-view="true"]'));
    const willClear = !(inTile || inCapsule || inControls || inMenu || inSettings);

    if (!willClear) {
      return;
    }

    clearResultSelection();
  }, [clearResultSelection, shellState]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      clearSelectionFromPointerEvent(event);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [clearSelectionFromPointerEvent]);

  const moveSelection = useCallback((direction: "left" | "right" | "up" | "down") => {
    if (images.length === 0) {
      return;
    }

    const focusedElement = document.activeElement;
    if (
      focusedElement instanceof HTMLElement &&
      (focusedElement.classList.contains("thumb") || focusedElement.classList.contains("unrecognized-item"))
    ) {
      focusedElement.blur();
    }

    if (selectedImageIndex < 0) {
      selectImageByIndex(0);
      return;
    }

    const columnCount = Math.max(1, gridMetrics.columnCount);
    const currentRow = Math.floor(selectedImageIndex / columnCount);
    const totalRows = Math.ceil(images.length / columnCount);

    if (direction === "up") {
      if (currentRow === 0) return;
      selectImageByIndex(selectedImageIndex - columnCount);
      return;
    }

    if (direction === "down") {
      if (currentRow >= totalRows - 1) return;
      selectImageByIndex(Math.min(images.length - 1, selectedImageIndex + columnCount));
      return;
    }

    if (direction === "left") {
      if (selectedImageIndex === 0) return;
      selectImageByIndex(selectedImageIndex - 1);
      return;
    }

    if (selectedImageIndex >= images.length - 1) return;
    selectImageByIndex(selectedImageIndex + 1);
  }, [gridMetrics.columnCount, images.length, selectImageByIndex, selectedImageIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (spaceReleaseGuardRef.current.shouldSuppressKeyDown(event.code)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if (event.ctrlKey && !event.altKey && !event.shiftKey && event.code === "KeyC" && selectedImageIds.size > 0) {
        event.preventDefault();
        if (event.repeat) return;
        const selectedPaths = images
          .filter((image) => selectedImageIds.has(image.id))
          .map((image) => image.filePath);
        void window.imageEverything?.files.copyItems(selectedPaths).then((copiedCount) => {
          onFeedback(copiedCount > 0
            ? t("clipboard.itemsCopied", { count: copiedCount })
            : t("clipboard.copyFailed"));
        }).catch(() => onFeedback(t("clipboard.copyFailed")));
        return;
      }

      if (isPlainSpaceShortcut(event)) {
        event.preventDefault();
        if (event.repeat || selectedImageIndex < 0 || imageContextMenuOpen || keywordEditorOpen) return;
        const focusedElement = document.activeElement;
        if (
          focusedElement instanceof HTMLElement &&
          focusedElement.closest(".thumb, .unrecognized-item")
        ) {
          focusedElement.blur();
        }
        const activeItem = images[selectedImageIndex];
        const selectedItems = images.filter((image) => selectedImageIds.has(image.id));
        if (spaceHoldController.start({
          index: selectedImageIndex,
          items: selectedItems.length > 0 ? selectedItems : [activeItem]
        })) setIsSpaceHolding(true);
        return;
      }

      if (event.key === "Enter" && selectedImageIndex >= 0) {
        event.preventDefault();
        onOpenImage(images[selectedImageIndex]);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelection("left");
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveSelection("right");
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection("up");
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection("down");
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (spaceReleaseGuardRef.current.consumeKeyUp(event.code)) {
        event.preventDefault();
        event.stopPropagation();
        cancelPendingSpaceHold();
        return;
      }
      if (event.code !== "Space" || !spaceHoldController.isActive()) return;
      event.preventDefault();
      spaceHoldController.release();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", cancelSpaceHold);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", cancelSpaceHold);
      spaceHoldController.cancel();
    };
  }, [cancelPendingSpaceHold, cancelSpaceHold, imageContextMenuOpen, images, keywordEditorOpen, moveSelection, onFeedback, onOpenImage, selectedImageIds, selectedImageIndex, spaceHoldController]);
  return (
    <main className={`results-view cap-results-view${isUnrecognizedView ? " cap-results-view-unrecognized" : ""}`} data-results-view="true">
      <Cap7CESearchCapsule
        search={search}
        directoryName={directoryName}
        directories={directories}
        labelVisibility={labelVisibility}
        status={resultStatusContent}
        inputFeedback={quickCommandNotice}
        inputFeedbackIsGuide={inputFeedbackIsGuide}
        unified
        autoSearchOnQueryClear
        skimDisplayMode={searchDisplayMode}
        enabledLabelGroups={standardSearchLabelGroups}
        imageContextMenuOpen={imageContextMenuOpen}
        inputRef={searchInputRef}
        onSearchChange={onSearchChange}
        onLabelVisibilityChange={onLabelVisibilityChange}
        onSkimDisplayModeChange={onSearchDisplayModeChange}
        onSearchOptionsChange={onSearchOptionsChange}
        onSearch={onSearch}
        onImageContextMenuClose={onContextMenuClose}
      />
      {isUnrecognizedView ? (
        <VirtualUnrecognizedList
          shellState={shellState}
          images={images}
          selectedImageIds={selectedImageIds}
          isSpaceHolding={isSpaceHolding}
          scrollTargetIndex={scrollTargetIndex}
          initialScrollTop={scrollTop}
          isSearching={isSearching}
          searchError={searchError}
          onSelectImage={handleImageClick}
          onScrollTopChange={onScrollTopChange}
          onScrollTargetHandled={() => setScrollTargetIndex(null)}
          onContextMenu={(event, item) => openContextMenuForItem(event, item, () => openPreviewForItem(item))}
          onOpenImage={onOpenImage}
          onStartDrag={startFileDrag}
          onLayoutChange={updateGridMetrics}
          onOpenSkim={onOpenSkim}
        />
      ) : (
        <VirtualImageGrid
          shellState={shellState}
          images={images}
          selectedImageIds={selectedImageIds}
          isSpaceHolding={isSpaceHolding}
          scrollTargetIndex={scrollTargetIndex}
          initialScrollTop={scrollTop}
          isSearching={isSearching}
          searchError={searchError}
          onSelectImage={handleImageClick}
          onScrollTopChange={onScrollTopChange}
          onScrollTargetHandled={() => setScrollTargetIndex(null)}
          onContextMenu={(event, item) => openContextMenuForItem(event, item, () => openPreviewForItem(item))}
          onOpenImage={onOpenImage}
          onStartDrag={startFileDrag}
          onLayoutChange={updateGridMetrics}
          onOpenSkim={onOpenSkim}
        />
      )}
    </main>
  );
};

const MiddleEllipsisFileName = ({ fileName, className }: { fileName: string; className: string }) => {
  const splitFileName = splitMiddleEllipsisFileName(fileName);
  return (
    <span className={className} title={fileName}>
      <span className="cap-middle-ellipsis-leading">{splitFileName.leading}</span>
      {splitFileName.trailing && <span className="cap-middle-ellipsis-trailing">{splitFileName.trailing}</span>}
    </span>
  );
};

const TwoLineMiddleEllipsisFileName = ({ fileName, className }: { fileName: string; className: string }) => {
  const splitFileName = splitMiddleEllipsisFileName(fileName);
  return (
    <span className={`${className} cap-two-line-middle-name${splitFileName.trailing ? " is-split" : ""}`} title={fileName}>
      <span className="cap-two-line-middle-leading">{splitFileName.leading}</span>
      {splitFileName.trailing && <span className="cap-two-line-middle-trailing">{`\u2026${splitFileName.trailing}`}</span>}
    </span>
  );
};

const ResultFormatCard = ({ item }: { item: ImageIndexItem }) => (
  <span className="result-file-card">
    <SvgIcon
      svg={getFormatIconSvg(item.extension, item.iconName)}
      className="cap-svg-icon result-file-card-icon"
    />
    <TwoLineMiddleEllipsisFileName fileName={item.fileName} className="result-file-card-name" />
  </span>
);

const ResultThumbnailContent = ({ item }: { item: ImageIndexItem }) => {
  const fallback = <ResultFormatCard item={item} />;
  return item.resultKind === "file"
    ? fallback
    : <ThumbnailContent thumbnailUrl={item.thumbnailUrl} fallback={fallback} />;
};

interface SkimViewProps {
  search: SearchState;
  visualSessionId: string;
  entries: SkimBrowseEntry[];
  currentPath: string | null;
  breadcrumbs: SkimBreadcrumb[];
  isLoading: boolean;
  feedback: string;
  theme: ResolvedThemeMode;
  appearanceColors: AppearanceColors;
  shellState: ShellState;
  isAddingDirectory: boolean;
  inputFeedback: string;
  inputFeedbackIsGuide: boolean;
  labelVisibility: SearchCapsuleLabelVisibility;
  skimDisplayMode: SkimDisplayMode;
  searchInputRef: Ref<HTMLInputElement>;
  onSearchChange: (search: SearchState) => void;
  onSearchOptionsChange: (search: SearchState) => void;
  onLabelVisibilityChange: (visibility: SearchCapsuleLabelVisibility) => void;
  onSkimDisplayModeChange: (mode: SkimDisplayMode) => void;
  onSearch: () => void;
  onOpenRoot: () => void;
  onOpenBreadcrumb: (path: string) => void;
  onOpenEntry: (entry: SkimBrowseEntry) => void;
  onAddEntries: (entries: SkimBrowseEntry[]) => void;
  onFeedback: (message: string) => void;
  onNativeDragStateChange: (active: boolean) => void;
}

type SkimContextMenuState = { x: number; y: number; item: SkimBrowseEntry; items: SkimBrowseEntry[] };

const SkimEntryVisual = ({ entry, sessionId, scrollContainerRef, fallbackSvg }: {
  entry: SkimBrowseEntry;
  sessionId: string;
  scrollContainerRef: RefObject<HTMLElement | null>;
  fallbackSvg: string;
}) => {
  const visualRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const canLoadThumbnail = entry.kind === "file" && Boolean(sessionId);

  useEffect(() => {
    setVisible(false);
    setFailed(false);
    if (!canLoadThumbnail) return undefined;
    const target = visualRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver((records) => {
      if (records.some((record) => record.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { root: scrollContainerRef.current, rootMargin: "120px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [canLoadThumbnail, entry.path, scrollContainerRef, sessionId]);

  return (
    <span className="cap-skim-entry-visual" ref={visualRef}>
      <SvgIcon svg={fallbackSvg} className="cap-svg-icon cap-skim-entry-icon" />
      {visible && !failed && (
        <img
          className="cap-skim-entry-thumbnail"
          src={`cap7ce://skim-thumbnail/?path=${encodeURIComponent(entry.path)}&session=${encodeURIComponent(sessionId)}`}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
};

const SkimView = ({ search, visualSessionId, entries, currentPath, breadcrumbs, isLoading, feedback, theme, appearanceColors, shellState, isAddingDirectory, inputFeedback, inputFeedbackIsGuide, labelVisibility, skimDisplayMode, searchInputRef, onSearchChange, onSearchOptionsChange, onLabelVisibilityChange, onSkimDisplayModeChange, onSearch, onOpenRoot, onOpenBreadcrumb, onOpenEntry, onAddEntries, onFeedback, onNativeDragStateChange }: SkimViewProps) => {
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const gridScrollFrameRef = useRef<number | null>(null);
  const gridResizeFrameRef = useRef<number | null>(null);
  const pendingGridScrollOffsetRef = useRef(0);
  const gridViewportRef = useRef({ width: 0, height: 0 });
  const [gridViewport, setGridViewport] = useState({ width: 0, height: 0 });
  const [gridScrollOffset, setGridScrollOffset] = useState(0);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [activePath, setActivePath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<SkimContextMenuState | null>(null);
  const [fileInfoDimensions, setFileInfoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [fileInfoFolderStats, setFileInfoFolderStats] = useState<SkimFolderStats | null>(null);
  const selectionAnchorPathRef = useRef<string | null>(null);
  const previewEntryPathRef = useRef<string | null>(null);
  const previewSessionCounterRef = useRef(0);
  const previewRequestGuard = useMemo(() => createPreviewRequestGuard(), []);
  const statusText = isLoading ? t("skim.loading") : t("skim.entryCount", { count: entries.length });
  const resolvedInputFeedback = feedback || inputFeedback;
  const isHorizontalGrid = shellState === "micro";
  const gridLayout = getImageGridLayout(getResultLayoutMode(shellState), gridViewport.width, gridViewport.height);
  const virtualGrid = useMemo(() => {
    const { cellSize, columnCount, contentWidth, isHorizontal } = gridLayout;
    const rowStride = cellSize + imageGridGap;
    const effectiveColumnCount = isHorizontal ? Math.max(1, columnCount) : columnCount;
    const totalRows = isHorizontal ? (entries.length > 0 ? 1 : 0) : Math.ceil(entries.length / effectiveColumnCount);
    const totalHeight = isHorizontal ? gridViewport.height : totalRows > 0 ? totalRows * rowStride - imageGridGap : 0;
    const totalWidth = isHorizontal && entries.length > 0
      ? entries.length * rowStride - imageGridGap
      : contentWidth;
    const visibleEntries: Array<{ entry: SkimBrowseEntry; top: number; left: number }> = [];

    if (entries.length === 0 || gridViewport.width === 0 || gridViewport.height === 0 || cellSize <= 0) {
      return { cellSize, totalHeight, totalWidth, visibleEntries };
    }

    if (isHorizontal) {
      const firstVisibleIndex = Math.max(0, Math.floor(gridScrollOffset / rowStride) - imageGridOverscanItems);
      const lastVisibleIndex = Math.min(entries.length - 1, Math.ceil((gridScrollOffset + gridViewport.width) / rowStride) + imageGridOverscanItems);
      for (let index = firstVisibleIndex; index <= lastVisibleIndex; index += 1) {
        const entry = entries[index];
        if (entry) visibleEntries.push({ entry, top: 0, left: index * rowStride });
      }
    } else {
      const firstVisibleRow = Math.max(0, Math.floor(gridScrollOffset / rowStride) - imageGridOverscanRows);
      const lastVisibleRow = Math.min(totalRows - 1, Math.ceil((gridScrollOffset + gridViewport.height) / rowStride) + imageGridOverscanRows);
      for (let row = firstVisibleRow; row <= lastVisibleRow; row += 1) {
        for (let column = 0; column < effectiveColumnCount; column += 1) {
          const entry = entries[row * effectiveColumnCount + column];
          if (entry) visibleEntries.push({ entry, top: row * rowStride, left: column * rowStride });
        }
      }
    }

    return { cellSize, totalHeight, totalWidth, visibleEntries };
  }, [entries, gridLayout.cellSize, gridLayout.columnCount, gridLayout.contentWidth, gridLayout.isHorizontal, gridScrollOffset, gridViewport.height, gridViewport.width]);
  const menuStyle = getImageContextMenuStyle(theme, appearanceColors);
  const getEntryIcon = (entry: SkimBrowseEntry) => {
    if (entry.kind === "drive") return skimDiskSvg;
    if (entry.kind === "folder") return skimFolderSvg;
    return skimFormatIconSvgByName[entry.formatCapability?.iconName ?? ""] ?? skimFileSvg;
  };

  useEffect(() => {
    setSelectedPaths(new Set());
    setActivePath(null);
    setContextMenu(null);
    selectionAnchorPathRef.current = null;
  }, [currentPath]);

  useEffect(() => {
    const entry = contextMenu?.item;
    setFileInfoDimensions(null);
    setFileInfoFolderStats(null);
    if (!entry) return;

    let active = true;
    let folderTimer: number | null = null;
    let folderTaskId: string | null = null;
    if (entry.kind === "folder") {
      folderTimer = window.setTimeout(() => {
        folderTimer = null;
        folderTaskId = `file-info:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        void window.imageEverything?.skim.readFileInfoFolderStats({ taskId: folderTaskId, path: entry.path })
          .then((stats) => {
            if (active && stats?.status === "completed") setFileInfoFolderStats(stats);
          });
      }, 300);
    } else if (entry.kind === "file" && entry.formatCapability?.previewKind === "image") {
      void window.imageEverything?.skim.readFileInfoDimensions(entry.path).then((dimensions) => {
        if (active) setFileInfoDimensions(dimensions ?? null);
      });
    }

    return () => {
      active = false;
      if (folderTimer !== null) window.clearTimeout(folderTimer);
      if (folderTaskId) void window.imageEverything?.skim.cancelFileInfoFolderStats(folderTaskId);
    };
  }, [contextMenu?.item]);

  useEffect(() => () => {
    previewRequestGuard.invalidate();
    previewEntryPathRef.current = null;
  }, [previewRequestGuard]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const measureViewport = () => {
      const nextViewport = {
        width: container.clientWidth,
        height: container.clientHeight
      };
      if (nextViewport.width !== gridViewportRef.current.width || nextViewport.height !== gridViewportRef.current.height) {
        gridViewportRef.current = nextViewport;
        setGridViewport(nextViewport);
      }
    };
    const scheduleViewportUpdate = () => {
      if (gridResizeFrameRef.current !== null) return;
      gridResizeFrameRef.current = window.requestAnimationFrame(() => {
        measureViewport();
        gridResizeFrameRef.current = null;
      });
    };

    measureViewport();
    const resizeObserver = new ResizeObserver(scheduleViewportUpdate);
    resizeObserver.observe(container);
    window.addEventListener("resize", scheduleViewportUpdate);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleViewportUpdate);
      if (gridResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(gridResizeFrameRef.current);
        gridResizeFrameRef.current = null;
      }
      if (gridScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(gridScrollFrameRef.current);
        gridScrollFrameRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (gridScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(gridScrollFrameRef.current);
      gridScrollFrameRef.current = null;
    }
    container.scrollTo({ left: 0, top: 0, behavior: "auto" });
    pendingGridScrollOffsetRef.current = 0;
    setGridScrollOffset(0);
  }, [currentPath]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const nextOffset = isHorizontalGrid ? container.scrollLeft : container.scrollTop;
    pendingGridScrollOffsetRef.current = nextOffset;
    setGridScrollOffset(nextOffset);
  }, [isHorizontalGrid]);

  const handleGridScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    pendingGridScrollOffsetRef.current = isHorizontalGrid ? event.currentTarget.scrollLeft : event.currentTarget.scrollTop;
    if (gridScrollFrameRef.current !== null) return;
    gridScrollFrameRef.current = window.requestAnimationFrame(() => {
      setGridScrollOffset(pendingGridScrollOffsetRef.current);
      gridScrollFrameRef.current = null;
    });
  }, [isHorizontalGrid]);

  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedPaths.has(entry.path)),
    [entries, selectedPaths]
  );

  useEffect(() => {
    const handleSelectionKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if (event.ctrlKey && !event.altKey && !event.shiftKey && event.code === "KeyC") {
        const copyPaths = selectedEntries
          .filter((entry) => entry.kind !== "drive")
          .map((entry) => entry.path);
        if (copyPaths.length === 0) return;
        event.preventDefault();
        if (event.repeat) return;
        void window.imageEverything?.files.copyItems(copyPaths).then((copiedCount) => {
          onFeedback(copiedCount > 0
            ? t("clipboard.itemsCopied", { count: copiedCount })
            : t("clipboard.copyFailed"));
        }).catch(() => onFeedback(t("clipboard.copyFailed")));
        return;
      }
      if (event.key !== "Escape") return;
      if (contextMenu) {
        setContextMenu(null);
        return;
      }
      if (selectedPaths.size > 0) {
        setSelectedPaths(new Set());
        setActivePath(null);
        selectionAnchorPathRef.current = null;
      }
    };
    window.addEventListener("keydown", handleSelectionKeyDown);
    return () => window.removeEventListener("keydown", handleSelectionKeyDown);
  }, [contextMenu, onFeedback, selectedEntries, selectedPaths]);

  const selectEntry = useCallback((entry: SkimBrowseEntry, ctrlKey: boolean, shiftKey: boolean) => {
    if (entry.kind === "drive") {
      setSelectedPaths(new Set([entry.path]));
      setActivePath(entry.path);
      selectionAnchorPathRef.current = entry.path;
      return;
    }
    if (shiftKey && selectionAnchorPathRef.current) {
      const anchorIndex = entries.findIndex((candidate) => candidate.path === selectionAnchorPathRef.current);
      const targetIndex = entries.findIndex((candidate) => candidate.path === entry.path);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const rangePaths = entries
          .slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
          .filter((candidate) => candidate.kind !== "drive")
          .map((candidate) => candidate.path);
        setSelectedPaths((current) => new Set(ctrlKey ? [...current, ...rangePaths] : rangePaths));
        setActivePath(entry.path);
        return;
      }
    }
    if (ctrlKey) {
      setSelectedPaths((current) => {
        const next = new Set(current);
        if (next.has(entry.path)) next.delete(entry.path);
        else next.add(entry.path);
        return next;
      });
    } else {
      setSelectedPaths(new Set([entry.path]));
    }
    setActivePath(entry.path);
    selectionAnchorPathRef.current = entry.path;
  }, [entries]);

  const openSystemPath = useCallback(async (targetPath: string) => {
    const result = await window.imageEverything?.files.open(targetPath);
    if (result) onFeedback(formatDisplayMessage(result));
  }, [onFeedback]);

  const openEntry = useCallback((entry: SkimBrowseEntry) => {
    setContextMenu(null);
    if (entry.kind === "drive" || entry.kind === "folder") {
      onOpenEntry(entry);
    } else {
      void openSystemPath(entry.path);
    }
  }, [onOpenEntry, openSystemPath]);

  const openPreview = useCallback(async (entry: SkimBrowseEntry) => {
    if (entry.kind === "drive") return;
    const openRequestId = previewRequestGuard.begin();
    setContextMenu(null);
    try {
      const info: SkimPreviewInfo | undefined = await window.imageEverything?.skim.inspect({
        path: entry.path,
        kind: entry.kind
      });
      if (!info || !previewRequestGuard.isCurrent(openRequestId)) return;
      const sessionId = `skim:${Date.now()}:${++previewSessionCounterRef.current}`;
      const imageProviderAvailable = entry.kind === "file"
        && entry.formatCapability?.previewKind === "image"
        && entry.formatCapability.canThumbnail
        && visualSessionId;
      const contentPreview = entry.kind === "file" && !imageProviderAvailable
        ? await resolveFileContentPreview(entry.path, entry.formatCapability?.previewKind ?? "fileInfo")
        : null;
      if (!previewRequestGuard.isCurrent(openRequestId)) return;
      const provider = entry.kind === "folder"
        ? "folderInfo"
        : imageProviderAvailable
          ? "image"
          : contentPreview?.provider ?? "fileInfo";
      const useAnimatedSourcePreview = provider === "image"
        && entry.formatCapability?.canDirectPreview
        && (entry.extension.toLowerCase() === ".gif" || entry.extension.toLowerCase() === ".webp");
      const skimPreviewUrl = provider === "image"
        ? useAnimatedSourcePreview
          ? `cap7ce://skim-image/?path=${encodeURIComponent(entry.path)}`
          : `cap7ce://skim-preview/?path=${encodeURIComponent(entry.path)}&session=${encodeURIComponent(visualSessionId)}`
        : contentPreview?.previewUrl ?? "";
      const previewData: PreviewWindowData = {
        sessionId,
        itemId: entry.path,
        filePath: entry.path,
        fileName: entry.name,
        fileSize: info.size,
        previewUrl: skimPreviewUrl,
        thumbnailUrl: provider === "image"
          ? `cap7ce://skim-thumbnail/?path=${encodeURIComponent(entry.path)}&session=${encodeURIComponent(visualSessionId)}`
          : "",
        provider,
        info,
        textPreview: contentPreview?.textPreview,
        skimActive: true,
        theme,
        language: getActiveLanguage(),
        appearanceColors
      };
      previewEntryPathRef.current = entry.path;
      const opened = await window.imageEverything?.preview.open(previewData);
      if (opened && provider === "folderInfo") {
        void window.imageEverything?.skim.startFolderStats({ sessionId, path: entry.path });
      }
    } catch (error) {
      onFeedback(formatDisplayMessage(error instanceof Error ? error.message : t("skim.readFailed")));
    }
  }, [appearanceColors, onFeedback, previewRequestGuard, theme, visualSessionId]);

  useEffect(() => {
    const movePreview = (direction: -1 | 1) => {
      const currentIndex = entries.findIndex((entry) => entry.path === previewEntryPathRef.current);
      if (currentIndex < 0) return;
      const nextIndex = Math.min(entries.length - 1, Math.max(0, currentIndex + direction));
      const nextEntry = entries[nextIndex];
      if (!nextEntry || nextEntry.kind === "drive" || nextIndex === currentIndex) return;
      setSelectedPaths(new Set([nextEntry.path]));
      setActivePath(nextEntry.path);
      selectionAnchorPathRef.current = nextEntry.path;
      void openPreview(nextEntry);
    };
    const unsubscribeNavigate = window.imageEverything?.preview.onNavigate(movePreview);
    const unsubscribeClosed = window.imageEverything?.preview.onClosed(() => {
      previewRequestGuard.invalidate();
      previewEntryPathRef.current = null;
    });
    return () => {
      unsubscribeNavigate?.();
      unsubscribeClosed?.();
    };
  }, [entries, openPreview, previewRequestGuard]);

  const openContextMenu = useCallback((event: React.MouseEvent, item: SkimBrowseEntry) => {
    if (item.kind === "drive") return;
    event.preventDefault();
    const contextPaths = selectedPaths.has(item.path) ? selectedPaths : new Set([item.path]);
    if (!selectedPaths.has(item.path)) setSelectedPaths(contextPaths);
    setActivePath(item.path);
    selectionAnchorPathRef.current = item.path;
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      item,
      items: entries.filter((entry) => contextPaths.has(entry.path))
    });
  }, [entries, selectedPaths]);

  const showEntryInFolder = useCallback((item: SkimBrowseEntry, itemCount: number) => {
    setContextMenu(null);
    if (itemCount > 1 && currentPath) {
      void openSystemPath(currentPath);
    } else {
      void window.imageEverything?.files.showInFolder(item.path);
    }
  }, [currentPath, openSystemPath]);

  return (
    <main
      className="skim-view cap-skim-view"
      data-skim-view="true"
      style={{
        "--cap-grid-target-size": `${imageGridTargetThumbSize}px`,
        "--cap-grid-gap": `${imageGridGap}px`
      } as CSSProperties}
      onClick={() => {
      setContextMenu(null);
      setSelectedPaths(new Set());
      setActivePath(null);
      selectionAnchorPathRef.current = null;
      }}
    >
      <Cap7CESearchCapsule
        search={search}
        directoryName=""
        labelVisibility={labelVisibility}
        status={statusText}
        inputFeedback={resolvedInputFeedback}
        inputFeedbackIsGuide={!feedback && inputFeedbackIsGuide}
        unified
        inputRef={searchInputRef}
        directoryGroup={{
          parentLabel: t("skim.computer"),
          collapsedLabel: breadcrumbs[breadcrumbs.length - 1]?.name ?? t("skim.computer"),
          selectedId: currentPath,
          options: breadcrumbs.map((breadcrumb) => ({
            id: breadcrumb.path,
            label: breadcrumb.name,
            title: breadcrumb.path
          })),
          onSelect: onOpenBreadcrumb,
          onReturnToParent: onOpenRoot
        }}
        skimDisplayMode={skimDisplayMode}
        onSkimDisplayModeChange={onSkimDisplayModeChange}
        enabledLabelGroups={["skimDisplay", "directory", "sort"]}
        onSearchChange={onSearchChange}
        onSearchOptionsChange={onSearchOptionsChange}
        onLabelVisibilityChange={onLabelVisibilityChange}
        onSearch={onSearch}
      />
      <div className={`cap-skim-grid-frame cap-scroll-viewport-frame cap-scroll-viewport-frame-${isHorizontalGrid ? "horizontal" : "vertical"}`}>
        <section
          className="cap-skim-grid cap-skim-grid-virtualized cap-main-scroll-viewport"
          ref={scrollContainerRef}
          aria-label={t("skim.name")}
          onScroll={handleGridScroll}
          onWheel={(event) => {
            if (!isHorizontalGrid || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            event.preventDefault();
            event.currentTarget.scrollTo({
              left: event.currentTarget.scrollLeft + event.deltaY,
              behavior: "auto"
            });
          }}
        >
          {isLoading && entries.length === 0 && <div className="empty-result-row">{t("skim.loading")}</div>}
          {!isLoading && entries.length === 0 && <div className="empty-result-row">{t("skim.empty")}</div>}
          {entries.length > 0 && (
            <div
              className="cap-skim-virtual-spacer"
              style={{
                width: isHorizontalGrid ? virtualGrid.totalWidth : "100%",
                height: virtualGrid.totalHeight
              }}
            >
              {virtualGrid.visibleEntries.map(({ entry, top, left }) => {
                const isSelected = selectedPaths.has(entry.path);
                const isActive = activePath === entry.path;
                return (
                  <button
                    className={`cap-skim-entry cap-skim-entry-${entry.kind}${isSelected ? " selected" : ""}${isActive ? " active" : ""}`}
                    type="button"
                    key={`${entry.kind}:${entry.path}`}
                    style={{
                      width: virtualGrid.cellSize,
                      height: virtualGrid.cellSize,
                      transform: `translate(${left}px, ${top}px)`
                    }}
                    title={entry.path}
                    aria-label={entry.label ? `${entry.label} ${entry.name}` : entry.name}
                    aria-pressed={isSelected}
                    draggable={entry.kind !== "drive"}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectEntry(entry, event.ctrlKey || event.metaKey, event.shiftKey);
                      setContextMenu(null);
                    }}
                    onDoubleClick={() => {
                      if (!isLoading) openEntry(entry);
                    }}
                    onContextMenu={(event) => openContextMenu(event, entry)}
                    onDragStart={(event) => {
                      if (entry.kind === "drive") return;
                      event.preventDefault();
                      onNativeDragStateChange(true);
                      const dragEntries = selectedPaths.has(entry.path)
                        ? selectedEntries.filter((candidate) => candidate.kind !== "drive")
                        : [entry];
                      window.imageEverything?.files.startDrag(dragEntries.map((candidate) => candidate.path));
                    }}
                    onDragEnd={() => onNativeDragStateChange(false)}
                    onKeyDown={(event) => {
                      if (!isLoading && event.key === "Enter") {
                        event.preventDefault();
                        openEntry(entry);
                      } else if (!isLoading && entry.kind !== "drive" && event.code === "Space") {
                        event.preventDefault();
                        if (event.repeat) return;
                        if (!selectedPaths.has(entry.path)) selectEntry(entry, false, false);
                        void openPreview(entry);
                      }
                    }}
                  >
                    <SkimEntryVisual
                      entry={entry}
                      sessionId={visualSessionId}
                      scrollContainerRef={scrollContainerRef}
                      fallbackSvg={getEntryIcon(entry)}
                    />
                    <TwoLineMiddleEllipsisFileName fileName={entry.label || entry.name} className="cap-skim-entry-name" />
                    {entry.label && <MiddleEllipsisFileName fileName={entry.name} className="cap-skim-entry-path" />}
                  </button>
                );
              })}
            </div>
          )}
        </section>
        <CustomScrollbar scrollContainerRef={scrollContainerRef} orientation={isHorizontalGrid ? "horizontal" : "vertical"} />
      </div>
      {contextMenu && (
        <ImageContextMenu
          key={`skim:${contextMenu.item.path}:${contextMenu.x}:${contextMenu.y}`}
          x={contextMenu.x}
          y={contextMenu.y}
          theme={theme}
          menuStyle={menuStyle}
          compact={shellState === "micro" || shellState === "mini"}
          header={{
            format: contextMenu.item.kind === "folder"
              ? t("fileInfo.folder")
              : contextMenu.item.extension.slice(1).toUpperCase() || t("fileInfo.file"),
            fileName: contextMenu.item.label || contextMenu.item.name,
            primaryDetail: contextMenu.item.kind === "folder"
              ? fileInfoFolderStats
                ? t("fileInfo.size", { size: formatCacheSize(fileInfoFolderStats.totalSize) })
                : undefined
              : t("fileInfo.size", { size: formatCacheSize(contextMenu.item.size ?? 0) }),
            details: contextMenu.item.kind === "folder"
              ? fileInfoFolderStats
                ? [t("fileInfo.compactContents", { files: fileInfoFolderStats.fileCount, folders: fileInfoFolderStats.folderCount })]
                : [t("fileInfo.calculating")]
              : fileInfoDimensions
                ? [t("fileInfo.resolution", { width: fileInfoDimensions.width, height: fileInfoDimensions.height })]
                : []
          }}
          groups={[
            {
              id: "view",
              label: t("context.view"),
              actions: [
                { id: "preview", label: t("skim.preview"), onSelect: () => void openPreview(contextMenu.item) },
                { id: "open", label: t("skim.openItem"), onSelect: () => openEntry(contextMenu.item) },
                { id: "showInFolder", label: t("skim.openPath"), onSelect: () => showEntryInFolder(contextMenu.item, contextMenu.items.length) }
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
                    void window.imageEverything?.files.copyPaths(contextMenu.items.map((entry) => entry.path));
                  }
                },
                {
                  id: "addDirectory",
                  label: t("skim.addDirectory"),
                  disabled: isAddingDirectory,
                  onSelect: () => {
                    setContextMenu(null);
                    if (!isAddingDirectory) onAddEntries(contextMenu.items);
                  }
                }
              ]
            }
          ]}
        />
      )}
    </main>
  );
};

type SearchCapsuleDirectoryOption = {
  id: string;
  label: string;
  title?: string;
};

type SearchCapsuleDirectoryGroup = {
  parentLabel: string;
  collapsedLabel?: string;
  selectedId: string | null;
  options: SearchCapsuleDirectoryOption[];
  onSelect: (id: string) => void;
  onReturnToParent: () => void;
};

interface Cap7CESearchCapsuleProps {
  search: SearchState;
  directoryName: string;
  directories?: DirectoryItem[];
  labelVisibility: SearchCapsuleLabelVisibility;
  status: React.ReactNode;
  inputFeedback?: string;
  inputFeedbackIsGuide?: boolean;
  autoSearchOnQueryClear?: boolean;
  unified?: boolean;
  leadingContent?: React.ReactNode;
  directoryGroup?: SearchCapsuleDirectoryGroup;
  skimDisplayMode?: SkimDisplayMode;
  enabledLabelGroups?: FilterChipGroup[];
  labelMenuEnabled?: boolean;
  imageContextMenuOpen?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onSearchChange: (search: SearchState) => void;
  onLabelVisibilityChange: (visibility: SearchCapsuleLabelVisibility) => void;
  onSearchOptionsChange?: (search: SearchState) => void;
  onSkimDisplayModeChange?: (mode: SkimDisplayMode) => void;
  onSearch: () => void;
  onImageContextMenuClose?: () => void;
}

type FilterChipGroup = "skimDisplay" | "directory" | "recognition" | "sort";
const standardSearchLabelGroups: FilterChipGroup[] = ["skimDisplay", "sort", "directory", "recognition"];

const filterChipEnterStaggerMs = 120;
const filterChipExitDurationMs = 350;
const filterChipExitStaggerMs = 35;
const filterChipMotionMaxStaggerSteps = 6;

const Cap7CESearchCapsule = ({ search, directoryName, directories = [], labelVisibility, status, inputFeedback = "", inputFeedbackIsGuide = false, autoSearchOnQueryClear = false, unified = false, leadingContent, directoryGroup, skimDisplayMode = "skim", enabledLabelGroups, labelMenuEnabled = true, imageContextMenuOpen = false, inputRef, onSearchChange, onLabelVisibilityChange, onSearchOptionsChange, onSkimDisplayModeChange, onSearch, onImageContextMenuClose }: Cap7CESearchCapsuleProps) => {
  const [skimDisplayChipsOpen, setSkimDisplayChipsOpen] = useState(false);
  const [directoryChipsOpen, setDirectoryChipsOpen] = useState(false);
  const [recognitionChipsOpen, setRecognitionChipsOpen] = useState(false);
  const [sortChipsOpen, setSortChipsOpen] = useState(false);
  const [closingChipGroup, setClosingChipGroup] = useState<FilterChipGroup | null>(null);
  const [labelMenuPointer, setLabelMenuPointer] = useState<MenuPointerPosition | null>(null);
  const [labelMenuThemeStyle, setLabelMenuThemeStyle] = useState<CSSProperties>({});
  const labelMenuRef = useRef<HTMLDivElement | null>(null);
  const chipGroupCloseTimerRef = useRef<number | null>(null);
  const queryClearSearchTimerRef = useRef<number | null>(null);
  const labelMenuMeasurementKey = labelMenuPointer ? `${labelMenuPointer.x}:${labelMenuPointer.y}` : "closed";

  const clearQueryClearSearchTimer = () => {
    if (queryClearSearchTimerRef.current !== null) {
      window.clearTimeout(queryClearSearchTimerRef.current);
      queryClearSearchTimerRef.current = null;
    }
  };

  const clearChipGroupCloseTimer = () => {
    if (chipGroupCloseTimerRef.current !== null) {
      window.clearTimeout(chipGroupCloseTimerRef.current);
      chipGroupCloseTimerRef.current = null;
    }
  };

  const closeChipGroup = (
    group: FilterChipGroup,
    itemCount: number,
    finishClose: () => void
  ) => {
    clearChipGroupCloseTimer();
    setClosingChipGroup(group);
    const staggerSteps = Math.min(
      filterChipMotionMaxStaggerSteps,
      Math.max(0, itemCount - 1)
    );
    chipGroupCloseTimerRef.current = window.setTimeout(() => {
      chipGroupCloseTimerRef.current = null;
      finishClose();
      setClosingChipGroup((current) => current === group ? null : current);
    }, filterChipExitDurationMs + staggerSteps * filterChipExitStaggerMs);
  };

  const prepareChipGroupOpen = () => {
    clearChipGroupCloseTimer();
    setClosingChipGroup(null);
  };

  const getChipMotionStyle = (index: number, itemCount: number): CSSProperties => ({
    "--cap-chip-delay": `${Math.min(index, filterChipMotionMaxStaggerSteps) * filterChipEnterStaggerMs}ms`,
    "--cap-chip-exit-delay": `${Math.min(
      Math.max(0, itemCount - 1 - index),
      filterChipMotionMaxStaggerSteps
    ) * filterChipExitStaggerMs}ms`
  } as CSSProperties);

  useEffect(() => () => {
    clearChipGroupCloseTimer();
    clearQueryClearSearchTimer();
  }, []);

  useEffect(() => {
    clearQueryClearSearchTimer();
  }, [search.directoryId, search.fileFormat, search.recognitionStatus, search.sortDirection, search.sortField]);

  useEffect(() => {
    if (!skimDisplayChipsOpen && !directoryChipsOpen && !recognitionChipsOpen && !sortChipsOpen && !labelMenuPointer) {
      return undefined;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      clearChipGroupCloseTimer();
      setClosingChipGroup(null);
      setDirectoryChipsOpen(false);
      setRecognitionChipsOpen(false);
      setSortChipsOpen(false);
      setLabelMenuPointer(null);
    };

    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [directoryChipsOpen, labelMenuPointer, recognitionChipsOpen, skimDisplayChipsOpen, sortChipsOpen]);
  const measuredLabelMenuPosition = useMeasuredViewportMenuPosition(labelMenuPointer, labelMenuRef, labelMenuMeasurementKey);
  const enabledGroups = new Set<FilterChipGroup>(enabledLabelGroups ?? ["directory", "recognition", "sort"]);
  const selectedDirectoryLabel = directoryGroup?.collapsedLabel
    ?? (search.directoryId === "all" ? t("filter.addedDirectories") : directoryName);
  const selectedDirectoryId = directoryGroup?.selectedId ?? (search.directoryId === "all" ? null : search.directoryId);
  const directoryOptions: SearchCapsuleDirectoryOption[] = directoryGroup?.options
    ?? directories
      .filter((directory) => directory.id !== "all")
      .map((directory) => ({ id: directory.id, label: directory.name, title: directory.path }));
  const expandedDirectories = unified && labelVisibility.directory && directoryChipsOpen
    ? directoryOptions
    : [];
  const expandedRecognitionStatuses = unified && recognitionChipsOpen
    ? (["recognized", "unrecognized"] as RecognitionStatusFilter[])
    : [];
  const expandedSkimDisplayModes = unified && labelVisibility.skimDisplay && skimDisplayChipsOpen
    ? (["all", "custom"] as SkimDisplayMode[])
    : [];

  const selectSkimDisplayMode = (mode: SkimDisplayMode) => {
    closeChipGroup("skimDisplay", expandedSkimDisplayModes.length, () => setSkimDisplayChipsOpen(false));
    onSkimDisplayModeChange?.(skimDisplayMode === mode ? "skim" : mode);
  };

  const toggleSkimDisplayChips = () => {
    clearChipGroupCloseTimer();
    setClosingChipGroup(null);
    setDirectoryChipsOpen(false);
    setRecognitionChipsOpen(false);
    setSortChipsOpen(false);
    if (!skimDisplayChipsOpen) {
      prepareChipGroupOpen();
      setSkimDisplayChipsOpen(true);
      return;
    }
    closeChipGroup("skimDisplay", expandedSkimDisplayModes.length, () => setSkimDisplayChipsOpen(false));
    if (skimDisplayMode !== "skim") onSkimDisplayModeChange?.("skim");
  };

  const selectDirectory = (directoryId: string) => {
    if (directoryGroup) {
      closeChipGroup("directory", expandedDirectories.length, () => setDirectoryChipsOpen(false));
      setSkimDisplayChipsOpen(false);
      if (directoryId === directoryGroup.selectedId) directoryGroup.onReturnToParent();
      else directoryGroup.onSelect(directoryId);
      return;
    }
    const nextSearch = {
      ...search,
      directoryId: search.directoryId === directoryId ? "all" : directoryId
    };
    closeChipGroup("directory", expandedDirectories.length, () => setDirectoryChipsOpen(false));
    onSearchChange(nextSearch);
    onSearchOptionsChange?.(nextSearch);
  };

  const selectRecognitionStatus = (recognitionStatus: RecognitionStatusFilter) => {
    const nextSearch = {
      ...search,
      recognitionStatus: search.recognitionStatus === recognitionStatus ? "all" : recognitionStatus
    };
    closeChipGroup("recognition", expandedRecognitionStatuses.length, () => setRecognitionChipsOpen(false));
    onSearchChange(nextSearch);
    onSearchOptionsChange?.(nextSearch);
  };

  const toggleDirectoryChips = () => {
    clearChipGroupCloseTimer();
    setClosingChipGroup(null);
    setRecognitionChipsOpen(false);
    setSortChipsOpen(false);
    setSkimDisplayChipsOpen(false);
    if (!directoryChipsOpen) {
      prepareChipGroupOpen();
      setDirectoryChipsOpen(true);
      return;
    }
    closeChipGroup("directory", expandedDirectories.length, () => setDirectoryChipsOpen(false));
    if (directoryGroup) {
      directoryGroup.onReturnToParent();
    } else if (search.directoryId !== "all") {
      const nextSearch = { ...search, directoryId: "all" };
      onSearchChange(nextSearch);
      onSearchOptionsChange?.(nextSearch);
    }
  };

  const toggleRecognitionChips = () => {
    clearChipGroupCloseTimer();
    setClosingChipGroup(null);
    setDirectoryChipsOpen(false);
    setSortChipsOpen(false);
    setSkimDisplayChipsOpen(false);
    if (!recognitionChipsOpen) {
      prepareChipGroupOpen();
      setRecognitionChipsOpen(true);
      return;
    }
    closeChipGroup("recognition", expandedRecognitionStatuses.length, () => setRecognitionChipsOpen(false));
    if (search.recognitionStatus !== "all") {
      const nextSearch = { ...search, recognitionStatus: "all" as RecognitionStatusFilter };
      onSearchChange(nextSearch);
      onSearchOptionsChange?.(nextSearch);
    }
  };

  const toggleSortChips = () => {
    clearChipGroupCloseTimer();
    setClosingChipGroup(null);
    setDirectoryChipsOpen(false);
    setRecognitionChipsOpen(false);
    setSkimDisplayChipsOpen(false);
    if (!sortChipsOpen) {
      prepareChipGroupOpen();
      setSortChipsOpen(true);
      return;
    }
    closeChipGroup("sort", 4, () => setSortChipsOpen(false));
  };

  const selectSortDirection = (sortDirection: SortDirection) => {
    const nextSearch = { ...search, sortDirection };
    onSearchChange(nextSearch);
    onSearchOptionsChange?.(nextSearch);
  };

  const selectSortField = (sortField: SortField) => {
    const nextSearch = { ...search, sortField };
    onSearchChange(nextSearch);
    onSearchOptionsChange?.(nextSearch);
  };

  const updateLabelVisibility = (nextVisibility: SearchCapsuleLabelVisibility) => {
    if (!nextVisibility.directory) {
      setDirectoryChipsOpen(false);
    }
    if (!nextVisibility.recognition) {
      setRecognitionChipsOpen(false);
    }
    if (!nextVisibility.sort) {
      setSortChipsOpen(false);
    }
    if (!nextVisibility.skimDisplay) {
      setSkimDisplayChipsOpen(false);
    }
    clearChipGroupCloseTimer();
    setClosingChipGroup(null);
    setLabelMenuPointer(null);
    onLabelVisibilityChange(nextVisibility);
  };

  const setEnabledLabelVisibility = (visible: boolean) => {
    const nextVisibility = { ...labelVisibility };
    for (const group of enabledGroups) nextVisibility[group] = visible;
    updateLabelVisibility(nextVisibility);
  };

  useLayoutEffect(() => {
    if (imageContextMenuOpen) {
      setLabelMenuPointer(null);
    }
  }, [imageContextMenuOpen]);

  const hideDirectoryLabel = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    updateLabelVisibility({ ...labelVisibility, directory: false });
  };

  const hideSortLabel = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    updateLabelVisibility({ ...labelVisibility, sort: false });
  };

  const hideRecognitionLabel = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    updateLabelVisibility({ ...labelVisibility, recognition: false });
  };

  const hideSkimDisplayLabel = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    updateLabelVisibility({ ...labelVisibility, skimDisplay: false });
  };

  const openLabelMenu = (event: React.MouseEvent<HTMLFormElement>) => {
    if (!labelMenuEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement;
    if (target.closest(".cap7ce-label-menu")) {
      return;
    }
    const capsuleStyle = window.getComputedStyle(event.currentTarget);
    setLabelMenuThemeStyle({
      "--panel-bg": capsuleStyle.getPropertyValue("--panel-bg").trim(),
      "--border-soft": capsuleStyle.getPropertyValue("--border-soft").trim(),
      "--text-main": capsuleStyle.getPropertyValue("--text-main").trim(),
      "--theme-color": capsuleStyle.getPropertyValue("--theme-color").trim(),
      "--theme-on-color": capsuleStyle.getPropertyValue("--theme-on-color").trim()
    } as CSSProperties);
    onImageContextMenuClose?.();
    setLabelMenuPointer({ x: event.clientX, y: event.clientY });
  };

  const labelMenuStyle: CSSProperties = measuredLabelMenuPosition
    ? {
      ...labelMenuThemeStyle,
      left: measuredLabelMenuPosition.left,
      top: measuredLabelMenuPosition.top,
      visibility: "visible"
    }
    : { ...labelMenuThemeStyle, left: 0, top: 0, visibility: "hidden" };
  const temporaryInputFeedback = inputFeedbackIsGuide ? "" : inputFeedback;
  return (
  <form
    className={`cap7ce-top-capsule cap7ce-search-capsule${unified ? " cap7ce-search-capsule-unified" : ""}${directoryChipsOpen ? " cap7ce-search-capsule-directory-open" : ""}${!enabledGroups.has("skimDisplay") ? " cap7ce-search-capsule-directory-first" : ""}`}
    data-search-capsule="true"
    onPointerDown={(event) => event.stopPropagation()}
    onContextMenu={openLabelMenu}
    onBlur={(event) => {
      const relatedTarget = event.relatedTarget as Node | null;
      if (!event.currentTarget.contains(relatedTarget) && !labelMenuRef.current?.contains(relatedTarget)) {
        clearChipGroupCloseTimer();
        setClosingChipGroup(null);
        setDirectoryChipsOpen(false);
        setRecognitionChipsOpen(false);
        setSortChipsOpen(false);
        setSkimDisplayChipsOpen(false);
        setLabelMenuPointer(null);
      }
    }}
    onSubmit={(event) => {
      event.preventDefault();
      clearQueryClearSearchTimer();
      onSearch();
    }}
  >
    {leadingContent}
    {enabledGroups.has("skimDisplay") && labelVisibility.skimDisplay && (
      <button
        className={`cap7ce-pill cap7ce-skim-display-tag${skimDisplayChipsOpen || skimDisplayMode !== "skim" ? " cap7ce-pill-wide" : " cap7ce-pill-icon"}`}
        type="button"
        title={skimDisplayChipsOpen ? t("skim.display.skimHint") : t("search.hideLabelHint")}
        aria-label={skimDisplayChipsOpen ? t("skim.display.parent") : t(`skim.display.${skimDisplayMode}` as TranslationKey)}
        aria-expanded={skimDisplayChipsOpen}
        data-selected="true"
        onContextMenu={hideSkimDisplayLabel}
        onClick={toggleSkimDisplayChips}
      >
        {skimDisplayChipsOpen || skimDisplayMode === "skim"
          ? <SvgIcon svg={iconSkimSvg} className="cap-svg-icon cap-skim-display-svg-icon" />
          : t(`skim.display.${skimDisplayMode}` as TranslationKey)}
      </button>
    )}
    {expandedSkimDisplayModes.map((mode, index) => (
      <button
        key={mode}
        className={`cap7ce-pill cap7ce-pill-wide cap7ce-skim-display-chip cap7ce-filter-chip-motion${closingChipGroup === "skimDisplay" ? " cap7ce-filter-chip-closing" : ""}`}
        type="button"
        data-selected={skimDisplayMode === mode}
        title={t(`skim.display.${mode}Hint` as TranslationKey)}
        style={getChipMotionStyle(index, expandedSkimDisplayModes.length)}
        onClick={() => selectSkimDisplayMode(mode)}
      >
        {t(`skim.display.${mode}` as TranslationKey)}
      </button>
    ))}
    {enabledGroups.has("sort") && labelVisibility.sort && (
    <button
      className={`cap7ce-pill cap7ce-sort-tag${sortChipsOpen ? " cap7ce-pill-wide" : " cap7ce-pill-icon"}`}
      type="button"
      title={t("search.hideLabelHint")}
      aria-label={sortChipsOpen ? t("sort.parent") : getSortDirectionLabels()[search.sortDirection]}
      aria-expanded={sortChipsOpen}
      onContextMenu={hideSortLabel}
      onClick={toggleSortChips}
    >
      {sortChipsOpen
        ? t("sort.parent")
        : (
          <SvgIcon
            svg={search.sortDirection === "asc" ? iconSortAscSvg : iconSortDescSvg}
            className="cap-svg-icon cap-sort-svg-icon"
          />
        )}
    </button>
    )}
    {sortChipsOpen && (["desc", "asc"] as SortDirection[]).map((sortDirection, index) => (
      <button
        key={sortDirection}
        className={`cap7ce-pill cap7ce-pill-icon cap7ce-sort-chip cap7ce-sort-direction-chip cap7ce-filter-chip-motion${closingChipGroup === "sort" ? " cap7ce-filter-chip-closing" : ""}`}
        type="button"
        title={getSortDirectionLabels()[sortDirection]}
        aria-label={getSortDirectionLabels()[sortDirection]}
        data-selected={search.sortDirection === sortDirection}
        style={getChipMotionStyle(index, 4)}
        onClick={() => selectSortDirection(sortDirection)}
      >
        <SvgIcon
          svg={sortDirection === "asc" ? iconSortAscSvg : iconSortDescSvg}
          className="cap-svg-icon cap-sort-svg-icon"
        />
      </button>
    ))}
    {sortChipsOpen && (["file_name", "modified_at"] as SortField[]).map((sortField, index) => (
      <button
        key={sortField}
        className={`cap7ce-pill cap7ce-pill-wide cap7ce-sort-chip cap7ce-filter-chip-motion${closingChipGroup === "sort" ? " cap7ce-filter-chip-closing" : ""}`}
        type="button"
        data-selected={search.sortField === sortField}
        style={getChipMotionStyle(index + 2, 4)}
        onClick={() => selectSortField(sortField)}
      >
        {getSortLabels()[sortField]}
      </button>
    ))}
    {enabledGroups.has("directory") && labelVisibility.directory && (
    <button
      className="cap7ce-pill cap7ce-pill-wide cap7ce-directory-tag"
      type="button"
      title={t("search.hideLabelHint")}
      aria-expanded={unified ? directoryChipsOpen : undefined}
      data-selected={selectedDirectoryId !== null}
      onContextMenu={hideDirectoryLabel}
      onClick={() => {
        if (unified) {
          toggleDirectoryChips();
        }
      }}
    >
      {unified
        ? directoryChipsOpen
          ? directoryGroup?.parentLabel ?? t("filter.addedDirectories")
          : selectedDirectoryLabel
        : directoryName || t("filter.allDirectories")}
    </button>
    )}
    {expandedDirectories.map((directory, index) => (
      <button
        key={directory.id}
        className={`cap7ce-pill cap7ce-pill-wide cap7ce-directory-chip cap7ce-filter-chip-motion${closingChipGroup === "directory" ? " cap7ce-filter-chip-closing" : ""}`}
        type="button"
        title={directory.title}
        data-selected={selectedDirectoryId === directory.id}
        style={getChipMotionStyle(index, expandedDirectories.length)}
        onClick={() => selectDirectory(directory.id)}
      >
        {directory.label}
      </button>
    ))}
    {unified && enabledGroups.has("recognition") && labelVisibility.recognition && (
    <button
      className="cap7ce-pill cap7ce-pill-wide cap7ce-recognition-tag"
      type="button"
      title={t("search.hideLabelHint")}
      aria-expanded={recognitionChipsOpen}
      data-selected={search.recognitionStatus !== "all"}
      onContextMenu={hideRecognitionLabel}
      onClick={toggleRecognitionChips}
    >
      {recognitionChipsOpen
        ? getRecognitionStatusLabels().all
        : getRecognitionStatusLabels()[search.recognitionStatus]}
    </button>
    )}
    {expandedRecognitionStatuses.map((recognitionStatus, index) => (
      <button
        key={recognitionStatus}
        className={`cap7ce-pill cap7ce-pill-wide cap7ce-recognition-chip cap7ce-filter-chip-motion${closingChipGroup === "recognition" ? " cap7ce-filter-chip-closing" : ""}`}
        type="button"
        title={t("search.filterTitle", { status: getRecognitionStatusLabels()[recognitionStatus] })}
        data-selected={search.recognitionStatus === recognitionStatus}
        style={getChipMotionStyle(index, expandedRecognitionStatuses.length)}
        onClick={() => selectRecognitionStatus(recognitionStatus)}
      >
        {getRecognitionStatusLabels()[recognitionStatus]}
      </button>
    ))}
    <button className="cap7ce-pill cap7ce-pill-icon" type="button" title={t("common.view")}>
      □
    </button>
    <div className="cap7ce-capsule-input-shell">
      <input
        className={`cap7ce-capsule-input${inputFeedbackIsGuide ? " cap-operation-hint" : ""}${temporaryInputFeedback ? " cap-temporary-feedback-active" : ""}`}
        ref={inputRef}
        value={search.query}
        placeholder={inputFeedbackIsGuide ? inputFeedback : ""}
        title={inputFeedback || undefined}
        onChange={(event) => {
          clearQueryClearSearchTimer();
          const nextSearch = { ...search, query: event.target.value };
          const userClearedQuery = autoSearchOnQueryClear
            && search.query.trim().length > 0
            && nextSearch.query.trim().length === 0;
          onSearchChange(nextSearch);
          if (userClearedQuery && onSearchOptionsChange) {
            queryClearSearchTimerRef.current = window.setTimeout(() => {
              queryClearSearchTimerRef.current = null;
              onSearchOptionsChange({ ...nextSearch, query: "" });
            }, 500);
          }
        }}
        aria-label={t("search.inputLabel")}
        autoComplete="off"
      />
      {temporaryInputFeedback && (
        <span className="cap7ce-capsule-input-feedback" title={temporaryInputFeedback}>
          {temporaryInputFeedback}
        </span>
      )}
    </div>
    <div className="cap7ce-capsule-status">{status}</div>
    {labelMenuEnabled && labelMenuPointer && createPortal(
      <div
        ref={labelMenuRef}
        className="cap7ce-label-menu"
        style={labelMenuStyle}
        role="menu"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="cap7ce-menu-motion-surface">
          <button type="button" role="menuitem" onClick={() => setEnabledLabelVisibility(true)}>{t("search.showAllLabels")}</button>
          <button type="button" role="menuitem" onClick={() => setEnabledLabelVisibility(false)}>{t("search.hideAllLabels")}</button>
        </div>
      </div>
    , document.body)}
  </form>
  );
};

interface VirtualImageGridProps {
  shellState: ShellState;
  images: ImageIndexItem[];
  selectedImageIds: ReadonlySet<string>;
  isSpaceHolding: boolean;
  scrollTargetIndex: number | null;
  initialScrollTop: number;
  isSearching: boolean;
  searchError: string;
  onSelectImage: (event: React.MouseEvent, item: ImageIndexItem) => void;
  onScrollTopChange: (scrollTop: number) => void;
  onScrollTargetHandled: () => void;
  onContextMenu: (event: React.MouseEvent, item: ImageIndexItem) => void;
  onOpenImage: (item: ImageIndexItem) => void;
  onStartDrag: (event: React.DragEvent, item: ImageIndexItem) => void;
  onLayoutChange: (metrics: { left: number; right: number; columnCount: number }) => void;
  onOpenSkim: () => void;
}

const EmptySearchResult = ({ message, onOpenSkim }: { message: string; onOpenSkim: () => void }) => (
  <button className="empty-result-row cap-skim-empty-entry" type="button" onClick={onOpenSkim}>
    <span className="cap-empty-result-content">
      <span>{message}</span>
      <span>{t("skim.searchElsewhere")}</span>
    </span>
  </button>
);

const VirtualImageGrid = ({ shellState, images, selectedImageIds, isSpaceHolding, scrollTargetIndex, initialScrollTop, isSearching, searchError, onSelectImage, onScrollTopChange, onScrollTargetHandled, onContextMenu, onOpenImage, onStartDrag, onLayoutChange, onOpenSkim }: VirtualImageGridProps) => {
  const containerRef = useRef<HTMLElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef(initialScrollTop);
  const restoredScrollTopRef = useRef(false);
  const viewportRef = useRef({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(initialScrollTop);
  const layoutMode = getResultLayoutMode(shellState);
  const isHorizontalGrid = layoutMode === "micro";
  const commitScrollTop = useCallback((nextScrollTop: number) => {
    pendingScrollTopRef.current = nextScrollTop;
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    setScrollTop((currentScrollTop) => currentScrollTop === nextScrollTop ? currentScrollTop : nextScrollTop);
    onScrollTopChange(nextScrollTop);
  }, [onScrollTopChange]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measureViewport = () => {
      const nextViewport = {
        width: container.clientWidth,
        height: container.clientHeight
      };

      if (nextViewport.width !== viewportRef.current.width || nextViewport.height !== viewportRef.current.height) {
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
      }
    };

    const scheduleViewportUpdate = () => {
      if (resizeFrameRef.current !== null) {
        return;
      }

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        measureViewport();
        resizeFrameRef.current = null;
      });
    };

    measureViewport();
    const resizeObserver = new ResizeObserver(scheduleViewportUpdate);
    resizeObserver.observe(container);
    window.addEventListener("resize", scheduleViewportUpdate);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleViewportUpdate);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    notifyGridInteraction();
    pendingScrollTopRef.current = isHorizontalGrid ? event.currentTarget.scrollLeft : event.currentTarget.scrollTop;
    if (scrollFrameRef.current !== null) {
      return;
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const nextScrollTop = pendingScrollTopRef.current;
      setScrollTop(nextScrollTop);
      onScrollTopChange(nextScrollTop);
      scrollFrameRef.current = null;
    });
  }, [isHorizontalGrid, onScrollTopChange]);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLElement>) => {
    if (!isHorizontalGrid || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }

    event.preventDefault();
    const nextScrollLeft = event.currentTarget.scrollLeft + event.deltaY;
    event.currentTarget.scrollTo({ left: nextScrollLeft, behavior: "auto" });
  }, [isHorizontalGrid]);

  const virtualGrid = useMemo(() => {
    const gridLayout = getImageGridLayout(layoutMode, viewport.width, viewport.height);
    const { columnCount, contentWidth, isHorizontal } = gridLayout;
    const cellSize = gridLayout.cellSize;
    const rowStride = cellSize + imageGridGap;
    const effectiveColumnCount = isHorizontal ? Math.max(1, columnCount) : columnCount;
    const totalRows = isHorizontal ? (images.length > 0 ? 1 : 0) : Math.ceil(images.length / effectiveColumnCount);
    const totalHeight = totalRows > 0 ? totalRows * rowStride - imageGridGap : 0;
    const totalWidth = isHorizontal && images.length > 0
      ? images.length * rowStride - imageGridGap
      : contentWidth;
    const gridWidth = isHorizontal ? Math.max(viewport.width, totalWidth) : contentWidth;
    const leftOffset = 0;
    const firstVisibleRow = isHorizontal ? 0 : Math.max(0, Math.floor(scrollTop / rowStride) - imageGridOverscanRows);
    const lastVisibleRow = isHorizontal ? 0 : Math.min(totalRows - 1, Math.ceil((scrollTop + viewport.height) / rowStride) + imageGridOverscanRows);
    const firstVisibleIndex = isHorizontal ? Math.max(0, Math.floor(scrollTop / rowStride) - imageGridOverscanItems) : 0;
    const lastVisibleIndex = isHorizontal ? Math.min(images.length - 1, Math.ceil((scrollTop + viewport.width) / rowStride) + imageGridOverscanItems) : -1;
    const visibleItems: Array<{ item: ImageIndexItem; top: number; left: number }> = [];

    if (images.length === 0 || viewport.width === 0 || viewport.height === 0 || cellSize <= 0) {
      return {
        totalHeight,
        totalWidth,
        columnCount,
        cellSize,
        leftOffset: 0,
        gridWidth: viewport.width,
        visibleItems
      };
    }

    if (isHorizontal) {
      for (let index = firstVisibleIndex; index <= lastVisibleIndex; index += 1) {
        const item = images[index];
        if (!item) continue;

        visibleItems.push({
          item,
          top: 0,
          left: leftOffset + index * rowStride
        });
      }
    } else {
      for (let row = firstVisibleRow; row <= lastVisibleRow; row += 1) {
        for (let column = 0; column < effectiveColumnCount; column += 1) {
          const index = row * effectiveColumnCount + column;
          const item = images[index];
          if (!item) continue;

          visibleItems.push({
            item,
            top: row * rowStride,
            left: leftOffset + column * rowStride
          });
        }
      }
    }

    return {
      totalHeight,
      totalWidth,
      columnCount: effectiveColumnCount,
      cellSize,
      leftOffset,
      gridWidth,
      visibleItems
    };
  }, [images, layoutMode, scrollTop, viewport.height, viewport.width]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!restoredScrollTopRef.current) {
      if (viewport.width <= 0 || viewport.height <= 0) return;
      restoredScrollTopRef.current = true;
      const restoredScrollTop = Math.max(0, initialScrollTop);
      container.scrollTo(isHorizontalGrid ? { left: restoredScrollTop, behavior: "auto" } : { top: restoredScrollTop, behavior: "auto" });
      commitScrollTop(isHorizontalGrid ? container.scrollLeft : container.scrollTop);
      return;
    }
    commitScrollTop(isHorizontalGrid ? container.scrollLeft : container.scrollTop);
  }, [commitScrollTop, images.length, initialScrollTop, isHorizontalGrid, viewport.height, viewport.width, virtualGrid.totalHeight, virtualGrid.totalWidth]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || scrollTargetIndex === null || viewport.width === 0 || images.length === 0) {
      return;
    }

    const safeIndex = Math.min(images.length - 1, Math.max(0, scrollTargetIndex));
    const { cellSize, columnCount, isHorizontal } = getImageGridLayout(layoutMode, viewport.width, viewport.height);
    const effectiveCellSize = cellSize;
    const rowStride = effectiveCellSize + imageGridGap;
    const targetOffset = isHorizontal
      ? getScrollLeftToRevealItem(container, safeIndex * rowStride, effectiveCellSize, 0)
      : getScrollTopToRevealItem(container, Math.floor(safeIndex / columnCount) * rowStride, effectiveCellSize, 0);

    if (isHorizontal) {
      if (targetOffset !== container.scrollLeft) {
        container.scrollTo({ left: targetOffset, behavior: "auto" });
      }
    } else if (targetOffset !== container.scrollTop) {
      container.scrollTo({ top: targetOffset, behavior: "auto" });
    }
    commitScrollTop(targetOffset);
    onScrollTargetHandled();
  }, [commitScrollTop, images.length, layoutMode, onScrollTargetHandled, scrollTargetIndex, viewport.height, viewport.width]);

  useEffect(() => {
    onLayoutChange({
      left: virtualGrid.leftOffset,
      right: virtualGrid.leftOffset + virtualGrid.gridWidth,
      columnCount: virtualGrid.columnCount
    });
  }, [onLayoutChange, virtualGrid.columnCount, virtualGrid.gridWidth, virtualGrid.leftOffset]);

  return (
    <div className={`image-grid-frame cap-scroll-viewport-frame cap-scroll-viewport-frame-${isHorizontalGrid ? "horizontal" : "vertical"}`}>
      <section className="image-grid cap-main-scroll-viewport" aria-label={t("search.resultGridLabel")} ref={containerRef} onScroll={handleScroll} onWheel={handleWheel}>
      {searchError && <div className="empty-result-row">{searchError}</div>}
      {!isSearching && !searchError && images.length === 0 && (
        <EmptySearchResult message={t("search.emptyResult")} onOpenSkim={onOpenSkim} />
      )}
      {!searchError && images.length > 0 && (
        <div className="virtual-grid-spacer" style={{ height: virtualGrid.totalHeight, width: isHorizontalGrid ? virtualGrid.totalWidth : "100%" }} data-rendered-count={virtualGrid.visibleItems.length} data-column-count={virtualGrid.columnCount}>
          {virtualGrid.visibleItems.map(({ item, top, left }) => (
            <button
              className={`thumb${selectedImageIds.has(item.id) ? " selected" : ""}${isSpaceHolding && selectedImageIds.has(item.id) ? " is-space-holding" : ""}`}
              data-result-tile="true"
              data-result-item-id={item.id}
              key={item.id}
              style={{
                width: virtualGrid.cellSize,
                height: virtualGrid.cellSize,
                transform: `translate(${left}px, ${top}px)`
              }}
              aria-label={item.fileName}
              aria-pressed={selectedImageIds.has(item.id)}
              onClick={(event) => onSelectImage(event, item)}
              onDoubleClick={() => onOpenImage(item)}
              onContextMenu={(event) => onContextMenu(event, item)}
              draggable
              onDragStart={(event) => onStartDrag(event, item)}
            >
              <ResultThumbnailContent item={item} />
            </button>
          ))}
        </div>
      )}
      </section>
      <CustomScrollbar scrollContainerRef={containerRef} orientation={isHorizontalGrid ? "horizontal" : "vertical"} />
    </div>
  );
};

const unrecognizedRowHeight = 68;
const unrecognizedRowGap = 8;
const unrecognizedColumnGap = 8;
const unrecognizedPreferredMinColumnWidth = 420;
const unrecognizedMaxColumnCount = 4;
const unrecognizedListEdgeInset = 6;
const unrecognizedListOverscanRows = 4;
const unrecognizedListOverscanItems = 4;

const measureUnrecognizedViewport = (container: HTMLElement) => {
  const styles = window.getComputedStyle(container);
  const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
  return {
    width: Math.max(0, Math.floor(container.clientWidth - horizontalPadding)),
    height: container.clientHeight
  };
};

const VirtualUnrecognizedList = ({ shellState, images, selectedImageIds, isSpaceHolding, scrollTargetIndex, initialScrollTop, isSearching, searchError, onSelectImage, onScrollTopChange, onScrollTargetHandled, onContextMenu, onOpenImage, onStartDrag, onLayoutChange, onOpenSkim }: VirtualImageGridProps) => {
  const containerRef = useRef<HTMLElement | null>(null);
  const viewportRef = useRef({ width: 0, height: 0 });
  const scrollFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef(initialScrollTop);
  const restoredScrollTopRef = useRef(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(initialScrollTop);
  const isHorizontalList = getResultLayoutMode(shellState) === "micro";

  const commitScrollTop = useCallback((nextScrollTop: number) => {
    pendingScrollTopRef.current = nextScrollTop;
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    setScrollTop((currentScrollTop) => currentScrollTop === nextScrollTop ? currentScrollTop : nextScrollTop);
    onScrollTopChange(nextScrollTop);
  }, [onScrollTopChange]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measureViewport = () => {
      const nextViewport = measureUnrecognizedViewport(container);
      if (nextViewport.width !== viewportRef.current.width || nextViewport.height !== viewportRef.current.height) {
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
      }
    };

    const scheduleViewportUpdate = () => {
      if (resizeFrameRef.current !== null) return;
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        measureViewport();
        resizeFrameRef.current = null;
      });
    };

    measureViewport();
    const resizeObserver = new ResizeObserver(scheduleViewportUpdate);
    resizeObserver.observe(container);
    window.addEventListener("resize", scheduleViewportUpdate);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleViewportUpdate);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
    };
  }, []);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }
  }, []);

  const handleScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    notifyGridInteraction();
    const nextViewport = measureUnrecognizedViewport(event.currentTarget);
    if (nextViewport.width !== viewportRef.current.width || nextViewport.height !== viewportRef.current.height) {
      viewportRef.current = nextViewport;
      setViewport(nextViewport);
    }
    pendingScrollTopRef.current = isHorizontalList ? event.currentTarget.scrollLeft : event.currentTarget.scrollTop;
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const nextScrollTop = pendingScrollTopRef.current;
      setScrollTop(nextScrollTop);
      onScrollTopChange(nextScrollTop);
      scrollFrameRef.current = null;
    });
  }, [isHorizontalList, onScrollTopChange]);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLElement>) => {
    if (!isHorizontalList || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }

    event.preventDefault();
    event.currentTarget.scrollTo({ left: event.currentTarget.scrollLeft + event.deltaY, behavior: "auto" });
  }, [isHorizontalList]);

  const virtualList = useMemo(() => {
    const rowStride = unrecognizedRowHeight + unrecognizedRowGap;
    const availableWidth = Math.max(0, viewport.width - unrecognizedListEdgeInset * 2);
    if (isHorizontalList) {
      const itemWidth = availableWidth;
      const itemStride = itemWidth + unrecognizedColumnGap;
      const firstVisibleIndex = Math.max(0, Math.floor(scrollTop / Math.max(1, itemStride)) - unrecognizedListOverscanItems);
      const lastVisibleIndex = Math.min(
        images.length - 1,
        Math.ceil((scrollTop + viewport.width) / Math.max(1, itemStride)) + unrecognizedListOverscanItems
      );
      const itemTop = Math.max(
        unrecognizedListEdgeInset,
        Math.floor((viewport.height - unrecognizedRowHeight) / 2)
      );
      const visibleItems: Array<{ item: ImageIndexItem; top: number; left: number }> = [];

      for (let index = firstVisibleIndex; index <= lastVisibleIndex; index += 1) {
        const item = images[index];
        if (item) {
          visibleItems.push({
            item,
            top: itemTop,
            left: unrecognizedListEdgeInset + index * itemStride
          });
        }
      }

      return {
        columnCount: 1,
        contentWidth: itemWidth,
        itemWidth,
        leftOffset: unrecognizedListEdgeInset,
        totalHeight: Math.max(viewport.height, unrecognizedRowHeight + unrecognizedListEdgeInset * 2),
        totalWidth: images.length > 0
          ? images.length * itemStride - unrecognizedColumnGap + unrecognizedListEdgeInset * 2
          : 0,
        visibleItems
      };
    }
    const columnCount = Math.min(
      unrecognizedMaxColumnCount,
      Math.max(1, Math.floor((availableWidth + unrecognizedColumnGap) / (unrecognizedPreferredMinColumnWidth + unrecognizedColumnGap)))
    );
    const contentWidth = availableWidth;
    const itemWidth = Math.max(
      0,
      (contentWidth - (columnCount - 1) * unrecognizedColumnGap) / columnCount
    );
    const leftOffset = unrecognizedListEdgeInset;
    const totalRows = Math.ceil(images.length / columnCount);
    const firstVisibleRow = Math.max(0, Math.floor(scrollTop / rowStride) - unrecognizedListOverscanRows);
    const lastVisibleRow = Math.min(totalRows - 1, Math.ceil((scrollTop + viewport.height) / rowStride) + unrecognizedListOverscanRows);
    const visibleItems: Array<{ item: ImageIndexItem; top: number; left: number }> = [];

    for (let row = firstVisibleRow; row <= lastVisibleRow; row += 1) {
      for (let column = 0; column < columnCount; column += 1) {
        const index = row * columnCount + column;
        const item = images[index];
        if (item) {
          visibleItems.push({
            item,
            top: unrecognizedListEdgeInset + row * rowStride,
            left: leftOffset + column * (itemWidth + unrecognizedColumnGap)
          });
        }
      }
    }

    return {
      columnCount,
      contentWidth,
      itemWidth,
      leftOffset,
      totalHeight: totalRows > 0 ? totalRows * rowStride - unrecognizedRowGap + unrecognizedListEdgeInset * 2 : 0,
      totalWidth: viewport.width,
      visibleItems
    };
  }, [images, isHorizontalList, scrollTop, viewport.height, viewport.width]);

  useEffect(() => {
    onLayoutChange({
      left: virtualList.leftOffset,
      right: virtualList.leftOffset + virtualList.contentWidth,
      columnCount: virtualList.columnCount
    });
  }, [onLayoutChange, virtualList.columnCount, virtualList.contentWidth, virtualList.leftOffset]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!restoredScrollTopRef.current) {
      if (viewport.width <= 0 || viewport.height <= 0) return;
      restoredScrollTopRef.current = true;
      const restoredScrollTop = Math.max(0, initialScrollTop);
      container.scrollTo(isHorizontalList
        ? { left: restoredScrollTop, behavior: "auto" }
        : { top: restoredScrollTop, behavior: "auto" });
      commitScrollTop(isHorizontalList ? container.scrollLeft : container.scrollTop);
      return;
    }
    commitScrollTop(isHorizontalList ? container.scrollLeft : container.scrollTop);
  }, [commitScrollTop, images.length, initialScrollTop, isHorizontalList, viewport.height, viewport.width, virtualList.totalHeight, virtualList.totalWidth]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || scrollTargetIndex === null || images.length === 0) return;

    const safeIndex = Math.min(images.length - 1, Math.max(0, scrollTargetIndex));
    let targetOffset: number;
    if (isHorizontalList) {
      const itemStride = virtualList.itemWidth + unrecognizedColumnGap;
      const itemLeft = unrecognizedListEdgeInset + safeIndex * itemStride;
      targetOffset = getScrollLeftToRevealItem(container, itemLeft, virtualList.itemWidth, unrecognizedListEdgeInset);
      if (targetOffset !== container.scrollLeft) {
        container.scrollTo({ left: targetOffset, behavior: "auto" });
      }
    } else {
      const rowStride = unrecognizedRowHeight + unrecognizedRowGap;
      const row = Math.floor(safeIndex / virtualList.columnCount);
      const itemTop = unrecognizedListEdgeInset + row * rowStride;
      targetOffset = getScrollTopToRevealItem(container, itemTop, unrecognizedRowHeight, unrecognizedListEdgeInset);
      if (targetOffset !== container.scrollTop) {
        container.scrollTo({ top: targetOffset, behavior: "auto" });
      }
    }
    commitScrollTop(targetOffset);
    onScrollTargetHandled();
  }, [commitScrollTop, images.length, isHorizontalList, onScrollTargetHandled, scrollTargetIndex, viewport.height, virtualList.columnCount, virtualList.itemWidth]);

  return (
    <div className={`image-grid-frame cap-scroll-viewport-frame cap-scroll-viewport-frame-${isHorizontalList ? "horizontal" : "vertical"}`}>
      <section className="image-grid unrecognized-list cap-main-scroll-viewport" aria-label={t("search.unrecognizedGridLabel")} ref={containerRef} onScroll={handleScroll} onWheel={handleWheel}>
      {searchError && <div className="empty-result-row">{searchError}</div>}
      {!isSearching && !searchError && images.length === 0 && (
        <EmptySearchResult message={t("search.emptyUnrecognized")} onOpenSkim={onOpenSkim} />
      )}
      {!searchError && images.length > 0 && (
        <div
          className="virtual-unrecognized-spacer"
          style={{ height: virtualList.totalHeight, width: isHorizontalList ? virtualList.totalWidth : "100%" }}
          data-rendered-count={virtualList.visibleItems.length}
        >
          {virtualList.visibleItems.map(({ item, top, left }) => {
            const directoryPath = getDirectoryPath(item.filePath);
            return (
              <button
                className={`unrecognized-item${selectedImageIds.has(item.id) ? " selected" : ""}${isSpaceHolding && selectedImageIds.has(item.id) ? " is-space-holding" : ""}`}
                data-result-tile="true"
                data-result-item-id={item.id}
                key={item.id}
                style={{
                  width: virtualList.itemWidth,
                  transform: `translate(${left}px, ${top}px)`
                }}
                aria-pressed={selectedImageIds.has(item.id)}
                onClick={(event) => onSelectImage(event, item)}
                onDoubleClick={() => onOpenImage(item)}
                onContextMenu={(event) => onContextMenu(event, item)}
                draggable
                onDragStart={(event) => onStartDrag(event, item)}
              >
                <UnrecognizedThumbnail item={item} />
                <span className="unrecognized-details">
                  <strong title={item.fileName}>{item.fileName}</strong>
                  <span className="unrecognized-path" title={directoryPath}>{directoryPath}</span>
                  <span className="unrecognized-file-size">{formatCacheSize(item.fileSize)}</span>
                </span>
                <span className={`failure-type failure-type-${item.failureType}`}>{item.failureLabel}</span>
              </button>
            );
          })}
        </div>
      )}
      </section>
      <CustomScrollbar scrollContainerRef={containerRef} orientation={isHorizontalList ? "horizontal" : "vertical"} />
    </div>
  );
};

type SettingsSelectOption = {
  value: string;
  label: string;
};

interface SettingsSelectProps {
  value: string;
  options: SettingsSelectOption[];
  disabled?: boolean;
  ariaLabel: string;
  title: string;
  className: string;
  menuStyle: CSSProperties;
  onChange: (value: string) => void;
}

const SettingsSelect = ({
  value,
  options,
  disabled = false,
  ariaLabel,
  title,
  className,
  menuStyle,
  onChange
}: SettingsSelectProps) => {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [anchor, setAnchor] = useState<{ left: number; top: number; bottom: number; width: number } | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedOption = options[selectedIndex] ?? options[0];

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setAnchor(null);
    setMenuPosition(null);
  }, []);

  const openMenu = useCallback((initialActiveIndex = selectedIndex) => {
    if (disabled || !triggerRef.current || options.length === 0) {
      return;
    }
    const bounds = triggerRef.current.getBoundingClientRect();
    setActiveIndex(initialActiveIndex);
    setMenuPosition(null);
    setAnchor({
      left: bounds.left,
      top: bounds.top,
      bottom: bounds.bottom,
      width: bounds.width
    });
    setIsOpen(true);
  }, [disabled, options.length, selectedIndex]);

  const selectOption = useCallback((index: number) => {
    const option = options[index];
    if (!option) return;
    if (option.value !== value) {
      onChange(option.value);
    }
    closeMenu();
    triggerRef.current?.focus();
  }, [closeMenu, onChange, options, value]);

  useLayoutEffect(() => {
    if (!isOpen || !anchor || !menuRef.current) {
      return;
    }
    const bounds = menuRef.current.getBoundingClientRect();
    const belowTop = anchor.bottom + viewportMenuGap;
    const aboveTop = anchor.top - bounds.height - viewportMenuGap;
    const top = belowTop + bounds.height <= window.innerHeight - viewportMenuGap
      ? belowTop
      : Math.max(viewportMenuGap, aboveTop);
    const left = Math.min(
      Math.max(viewportMenuGap, anchor.left),
      Math.max(viewportMenuGap, window.innerWidth - bounds.width - viewportMenuGap)
    );
    setMenuPosition({ left, top });
  }, [anchor, isOpen, options.length]);

  useEffect(() => {
    if (!isOpen) return;

    const closeForOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node
        && (triggerRef.current?.contains(target) || menuRef.current?.contains(target))
      ) {
        return;
      }
      closeMenu();
    };
    const closeForScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }
      closeMenu();
    };
    const closeForViewportChange = () => closeMenu();
    document.addEventListener("pointerdown", closeForOutsidePointer, true);
    window.addEventListener("resize", closeForViewportChange);
    window.addEventListener("blur", closeForViewportChange);
    window.addEventListener("scroll", closeForScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeForOutsidePointer, true);
      window.removeEventListener("resize", closeForViewportChange);
      window.removeEventListener("blur", closeForViewportChange);
      window.removeEventListener("scroll", closeForScroll, true);
    };
  }, [closeMenu, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !menuPosition) return;
    menuRef.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(`${listboxId}-option-${activeIndex}`)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen, listboxId, menuPosition]);

  useEffect(() => {
    if (disabled) {
      closeMenu();
    }
  }, [closeMenu, disabled]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || options.length === 0) {
      return;
    }

    if (!isOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMenu(selectedIndex);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === "Tab") {
      closeMenu();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(activeIndex >= 0 ? activeIndex : selectedIndex);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        if (current < 0) {
          return direction > 0 ? 0 : options.length - 1;
        }
        return (current + direction + options.length) % options.length;
      });
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        className={`cap-settings-select ${className}${isOpen ? " is-open" : ""}`}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        title={title}
        onClick={() => isOpen ? closeMenu() : openMenu(-1)}
        onKeyDown={handleKeyDown}
      >
        <span className="cap-settings-select-value" title={selectedOption?.label}>{selectedOption?.label}</span>
      </button>
      {isOpen && anchor && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          className="context-menu cap-settings-select-menu"
          data-context-menu="true"
          role="listbox"
          aria-label={ariaLabel}
          style={{
            ...menuStyle,
            left: menuPosition?.left ?? anchor.left,
            top: menuPosition?.top ?? anchor.bottom + viewportMenuGap,
            width: anchor.width,
            visibility: menuPosition ? "visible" : "hidden"
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="cap7ce-menu-motion-surface">
            {options.map((option, index) => (
              <button
                key={option.value}
                id={`${listboxId}-option-${index}`}
                className={index === activeIndex ? "is-active" : undefined}
                type="button"
                role="option"
                aria-selected={option.value === value}
                tabIndex={-1}
                title={option.label}
                onPointerEnter={() => setActiveIndex(-1)}
                onClick={() => selectOption(index)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

interface SettingsViewProps {
  search: SearchState;
  quickCommandNotice: string;
  inputFeedbackIsGuide: boolean;
  searchInputRef: Ref<HTMLInputElement>;
  directoryName: string;
  status: React.ReactNode;
  searchDirectories: DirectoryItem[];
  labelVisibility: SearchCapsuleLabelVisibility;
  theme: ThemeMode;
  menuStyle: CSSProperties;
  languagePreference: LanguagePreference;
  appearanceColors: AppearanceColors;
  edgeSnapEnabled: boolean;
  standbyLineVisible: boolean;
  launchAtLogin: boolean;
  systemNotificationsEnabled: boolean;
  operationHintsEnabled: boolean;
  quickActionGlobalEnabled: boolean;
  shortcutActions: ShortcutActionPreferences;
  unavailableShortcutActionIds: ShortcutActionId[];
  quickActionsExpanded: boolean;
  quickCommandsExpanded: boolean;
  skimDisplay: SkimDisplayPreferences;
  directories: DirectoryItem[];
  isLoadingDirectories: boolean;
  isAddingDirectory: boolean;
  directoryServiceUnavailable: boolean;
  isScanning: boolean;
  isCancellingRecognition: boolean;
  aiProgress: AiIndexProgress | null;
  scanSummary: ScanSummary | null;
  scanError: string;
  indexStats: IndexQualityStats;
  llamaRuntimeSettings: LlamaRuntimeSettings;
  llamaRuntimeProcessState: LlamaRuntimeProcessState;
  ggufModelSettings: GgufModelSettings;
  isLoadingLlamaRuntime: boolean;
  isLoadingGgufModels: boolean;
  isChangingLlamaRuntimeState: boolean;
  visualCacheStats: VisualCacheStats;
  skimCacheStats: VisualCacheStats;
  thumbnailOptimizationStatus: ThumbnailOptimizationStatus;
  isLoadingCacheStats: boolean;
  isClearingCache: boolean;
  isClearingSkimCache: boolean;
  cacheInlineFeedback: string;
  skimCacheInlineFeedback: string;
  editingDirectoryId: string | null;
  onSearchChange: (search: SearchState) => void;
  onLabelVisibilityChange: (visibility: SearchCapsuleLabelVisibility) => void;
  onSearchOptionsChange: (search: SearchState) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onLanguageChange: (language: LanguagePreference) => void;
  onAppearanceColorsPreview: (appearanceColors: AppearanceColors) => void;
  onAppearanceColorsChange: (appearanceColors: AppearanceColors) => void;
  onEdgeSnapChange: (edgeSnapEnabled: boolean) => void;
  onStandbyLineVisibleChange: (standbyLineVisible: boolean) => void;
  onLaunchAtLoginChange: (launchAtLogin: boolean) => void;
  onSystemNotificationsChange: (enabled: boolean) => void;
  onOperationHintsChange: (enabled: boolean) => void;
  onAutoCacheOptimizationChange: (enabled: boolean) => void;
  onQuickActionGlobalEnabledChange: (quickActionGlobalEnabled: boolean) => void;
  onShortcutActionsChange: (shortcutActions: ShortcutActionPreferences) => Promise<ShortcutActionsUpdateResult | null>;
  onShortcutCaptureStart: () => Promise<boolean>;
  onShortcutCaptureEnd: () => Promise<ShortcutAvailabilityResult>;
  onQuickActionsExpandedChange: (expanded: boolean) => void;
  onQuickCommandsExpandedChange: (expanded: boolean) => void;
  onSkimDisplayChange: (skimDisplay: SkimDisplayPreferences) => void;
  onSearch: () => void;
  onStartAdd: () => void;
  onUpdateAll: () => void;
  onRecognizeDirectory: (directoryId: string) => void;
  onContinueRecognition: () => void;
  onCancelRecognition: () => void;
  onRetryIndex: () => void;
  onLlamaRuntimeChange: (version: string) => void;
  onRefreshLlamaRuntime: () => void;
  onGgufModelChange: (modelId: string) => void;
  onRefreshGgufModels: () => void;
  onStartLlamaRuntime: () => void;
  onStopLlamaRuntime: () => void;
  onClearCache: () => void;
  onClearSkimCache: () => void;
  onOpenIndexView: (recognitionStatus: RecognitionStatusFilter) => void;
  onEditDirectory: (id: string) => void;
  onCancelDirectoryEdit: () => void;
  onDirectoryNameChange: (id: string, name: string) => void;
  onDeleteDirectory: (id: string) => void;
}

const SettingsView = ({ search, quickCommandNotice, inputFeedbackIsGuide, searchInputRef, directoryName, status, searchDirectories, labelVisibility, theme, menuStyle, languagePreference, appearanceColors, edgeSnapEnabled, standbyLineVisible, launchAtLogin, systemNotificationsEnabled, operationHintsEnabled, quickActionGlobalEnabled, shortcutActions, unavailableShortcutActionIds, quickActionsExpanded, quickCommandsExpanded, skimDisplay, directories, isLoadingDirectories, isAddingDirectory, directoryServiceUnavailable, isScanning, isCancellingRecognition, aiProgress, scanSummary, scanError, indexStats, llamaRuntimeSettings, llamaRuntimeProcessState, ggufModelSettings, isLoadingLlamaRuntime, isLoadingGgufModels, isChangingLlamaRuntimeState, visualCacheStats, skimCacheStats, thumbnailOptimizationStatus, isLoadingCacheStats, isClearingCache, isClearingSkimCache, cacheInlineFeedback, skimCacheInlineFeedback, editingDirectoryId, onSearchChange, onLabelVisibilityChange, onSearchOptionsChange, onThemeChange, onLanguageChange, onAppearanceColorsPreview, onAppearanceColorsChange, onEdgeSnapChange, onStandbyLineVisibleChange, onLaunchAtLoginChange, onSystemNotificationsChange, onOperationHintsChange, onAutoCacheOptimizationChange, onQuickActionGlobalEnabledChange, onShortcutActionsChange, onShortcutCaptureStart, onShortcutCaptureEnd, onQuickActionsExpandedChange, onQuickCommandsExpandedChange, onSkimDisplayChange, onSearch, onStartAdd, onUpdateAll, onRecognizeDirectory, onContinueRecognition, onCancelRecognition, onRetryIndex, onLlamaRuntimeChange, onRefreshLlamaRuntime, onGgufModelChange, onRefreshGgufModels, onStartLlamaRuntime, onStopLlamaRuntime, onClearCache, onClearSkimCache, onOpenIndexView, onEditDirectory, onCancelDirectoryEdit, onDirectoryNameChange, onDeleteDirectory }: SettingsViewProps) => {
  const [selectedIndexStat, setSelectedIndexStat] = useState<RecognitionStatusFilter | null>(null);
  const [indexDetailsExpanded, setIndexDetailsExpanded] = useState(isScanning);
  const [indexDetailsClosing, setIndexDetailsClosing] = useState(false);
  const [directoriesExpanded, setDirectoriesExpanded] = useState(false);
  const [directoriesClosing, setDirectoriesClosing] = useState(false);
  const [originImageUrl, setOriginImageUrl] = useState<string | null>(null);
  const [originVisible, setOriginVisible] = useState(false);
  const settingsScrollRef = useRef<HTMLDivElement | null>(null);
  const themeColorButtonRef = useRef<HTMLButtonElement | null>(null);
  const accentColorButtonRef = useRef<HTMLButtonElement | null>(null);
  const [activeColorPicker, setActiveColorPicker] = useState<keyof AppearanceColors | null>(null);
  const quickActionsCollapseTimerRef = useRef<number | null>(null);
  const quickCommandsCollapseTimerRef = useRef<number | null>(null);
  const skimDisplayCollapseTimerRef = useRef<number | null>(null);
  const runtimeDetailsCollapseTimerRef = useRef<number | null>(null);
  const indexDetailsCollapseTimerRef = useRef<number | null>(null);
  const directoriesCollapseTimerRef = useRef<number | null>(null);
  const originSequenceRef = useRef({ count: 0, lastClickAt: 0 });
  const originLoadingRef = useRef(false);
  const [quickActionsClosing, setQuickActionsClosing] = useState(false);
  const [quickCommandsClosing, setQuickCommandsClosing] = useState(false);
  const [skimDisplayExpanded, setSkimDisplayExpanded] = useState(false);
  const [skimDisplayClosing, setSkimDisplayClosing] = useState(false);
  const [runtimeDetailsExpanded, setRuntimeDetailsExpanded] = useState(false);
  const [runtimeDetailsClosing, setRuntimeDetailsClosing] = useState(false);
  const [capturingShortcutActionId, setCapturingShortcutActionId] = useState<ShortcutActionId | null>(null);
  const [shortcutActionDrafts, setShortcutActionDrafts] = useState<ShortcutActionPreferences>(shortcutActions);
  const [draftUnavailableActionIds, setDraftUnavailableActionIds] = useState<ShortcutActionId[]>([]);
  const [appUpdateStatus, setAppUpdateStatus] = useState<"idle" | "checking" | "up_to_date" | "update_available" | "downloading" | "installing" | "unsupported" | "failed" | "download_failed">("idle");
  const [appUpdateVersion, setAppUpdateVersion] = useState("");
  const [appUpdateProgress, setAppUpdateProgress] = useState<{ receivedBytes: number; totalBytes: number | null; percent: number | null } | null>(null);
  const selectedGgufModel = ggufModelSettings.models.find((model) => model.id === ggufModelSettings.selectedModelId);
  const selectedLlamaRuntime = llamaRuntimeSettings.versions.find((runtime) => runtime.version === llamaRuntimeSettings.selectedVersion);
  const isLlamaRuntimeRunning = llamaRuntimeProcessState.status === "running";
  const isLlamaRuntimeStarting = llamaRuntimeProcessState.status === "starting";
  const llamaRuntimeActionDisabled = isChangingLlamaRuntimeState
    || isLlamaRuntimeStarting
    || (!isLlamaRuntimeRunning && (llamaRuntimeSettings.status !== "available" || ggufModelSettings.status !== "ready"));
  const runtimeErrorMessage = llamaRuntimeProcessState.status === "failed"
    ? llamaRuntimeProcessState.message
    : llamaRuntimeSettings.status === "missing_root"
      || llamaRuntimeSettings.status === "missing_server"
      || llamaRuntimeSettings.status === "selection_missing"
      ? llamaRuntimeSettings.message
      : "";
  const runtimeMessageIsFailure = llamaRuntimeProcessState.status === "failed";
  const runtimeIsMissing = llamaRuntimeSettings.status === "missing_root"
    || llamaRuntimeSettings.status === "missing_server"
    || llamaRuntimeSettings.status === "selection_missing";
  const runtimeHasMissingPrompt = runtimeIsMissing || Boolean(runtimeErrorMessage);
  const runtimeStatusLabel = runtimeHasMissingPrompt ? t("runtime.notFound") : getLlamaRuntimeProcessStatusLabel(llamaRuntimeProcessState);
  const cacheStatusValues = {
    count: visualCacheStats.cacheCount,
    size: formatCacheSize(visualCacheStats.totalBytes),
    processed: thumbnailOptimizationStatus.processedCount,
    remaining: thumbnailOptimizationStatus.queuedCount
  };
  const cacheOptimizationStatusLabel = cacheInlineFeedback
    || (isLoadingCacheStats
      ? t("settings.readingCache")
      : thumbnailOptimizationStatus.phase === "running"
        ? t("settings.cacheOptimizationRunning", cacheStatusValues)
        : thumbnailOptimizationStatus.phase === "completed"
          ? t("settings.cacheOptimizationCompleted", cacheStatusValues)
          : thumbnailOptimizationStatus.enabled
            ? t("settings.cacheOptimizationReady", cacheStatusValues)
            : t("settings.cacheOptimizationDisabled", cacheStatusValues));
  const modelErrorMessage = llamaRuntimeProcessState.selectedModelId === ggufModelSettings.selectedModelId
    && llamaRuntimeProcessState.modelStatus === "load_failed"
    ? llamaRuntimeProcessState.modelMessage
    : ggufModelSettings.status === "unpaired"
      || ggufModelSettings.status === "selection_missing"
      || ggufModelSettings.status === "missing_directory"
      ? ggufModelSettings.message
      : "";
  const modelMessageIsFailure = llamaRuntimeProcessState.selectedModelId === ggufModelSettings.selectedModelId
    && llamaRuntimeProcessState.modelStatus === "load_failed";
  const modelIsMissing = ggufModelSettings.status === "unpaired"
    || ggufModelSettings.status === "selection_missing"
    || ggufModelSettings.status === "missing_directory";
  const modelHasMissingPrompt = modelIsMissing || Boolean(modelErrorMessage);
  const modelStatusLabel = modelHasMissingPrompt ? t("model.notFound") : getGgufModelStatusLabel(ggufModelSettings, llamaRuntimeProcessState);
  const currentAppearanceColors = appearanceColors;
  const recognitionStatusLabels = getRecognitionStatusLabels();
  const skimFormatGroups = useMemo(() => {
    const groups = new Map<FileFormatCategory, string[]>(
      settingsFormatCategoryOrder.map((category) => [category, []])
    );
    for (const capability of fileFormatCapabilities) {
      if (!capability.canBrowse) continue;
      const displayCategory = settingsFormatCategoryOverrides.get(capability.extension) ?? capability.category;
      const extensions = groups.get(displayCategory) ?? [];
      extensions.push(capability.extension);
      groups.set(displayCategory, extensions);
    }
    return settingsFormatCategoryOrder.map((category) => ({
      category,
      extensions: (groups.get(category) ?? []).sort((left, right) => (
        left.slice(1).localeCompare(right.slice(1), "en-US", { numeric: true, sensitivity: "base" })
      ))
    }));
  }, []);
  const selectedSkimExtensions = new Set(skimDisplay.customExtensions);
  const updateCustomSkimExtensions = (customExtensions: string[]) => onSkimDisplayChange({
    ...skimDisplay,
    customExtensions: [...new Set(customExtensions)].sort()
  });
  const toggleSkimCategory = (extensions: string[]) => {
    const allSelected = extensions.every((extension) => selectedSkimExtensions.has(extension));
    const nextExtensions = new Set(selectedSkimExtensions);
    for (const extension of extensions) {
      if (allSelected) nextExtensions.delete(extension);
      else nextExtensions.add(extension);
    }
    updateCustomSkimExtensions([...nextExtensions]);
  };
  const toggleSkimExtension = (extension: string) => {
    const nextExtensions = new Set(selectedSkimExtensions);
    if (nextExtensions.has(extension)) nextExtensions.delete(extension);
    else nextExtensions.add(extension);
    updateCustomSkimExtensions([...nextExtensions]);
  };
  const indexStatItems: Array<{ status: RecognitionStatusFilter; label: string; value: number; title: string }> = [
    { status: "all", label: recognitionStatusLabels.all, value: indexStats.totalImages, title: t("settings.viewAllSupportedHint") },
    { status: "recognized", label: recognitionStatusLabels.recognized, value: indexStats.recognizedImages, title: t("settings.viewRecognizedHint") },
    { status: "unrecognized", label: recognitionStatusLabels.unrecognized, value: indexStats.unrecognizedImages, title: t("settings.viewUnrecognizedHint") }
  ];
  const indexFailed = aiProgress?.phase === "failed" || Boolean(scanError);
  const indexCancelled = aiProgress?.phase === "cancelled";
  const indexCompleted = !indexFailed && !indexCancelled && (aiProgress?.phase === "completed" || scanSummary !== null);
  const indexIsRecognizing = aiProgress?.phase === "checking" || aiProgress?.phase === "processing";
  const indexRecognitionStarted = indexIsRecognizing
    || Boolean(aiProgress?.currentFileName)
    || (aiProgress?.total ?? scanSummary?.aiTotal ?? 0) > 0
    || scanSummary !== null;
  const indexStatusLabel = indexCancelled
    ? t("common.cancelled")
    : indexFailed ? indexRecognitionStarted ? t("settings.recognitionFailed") : t("settings.scanFailed")
      : indexCompleted ? t("common.completed")
        : isScanning ? indexIsRecognizing ? t("settings.indexRecognizing") : t("settings.indexScanning")
          : t("common.idle");
  const indexProgressTotal = aiProgress?.total ?? scanSummary?.aiTotal ?? 0;
  const indexProgressCurrent = aiProgress?.current ?? (indexCompleted ? indexProgressTotal : 0);
  const indexCompletedCount = aiProgress?.completed ?? scanSummary?.aiCompleted ?? 0;
  const indexFailedCount = aiProgress?.failed ?? scanSummary?.aiFailed ?? 0;
  const indexErrorSummary = indexFailed ? formatDisplayMessage(scanError || aiProgress?.message) : "";
  const hasIndexDetails = isScanning || aiProgress !== null || scanSummary !== null || Boolean(scanError);
  const appUpdateStatusLabel = appUpdateStatus === "checking"
    ? t("settings.updateChecking")
    : appUpdateStatus === "up_to_date"
      ? t("settings.updateUpToDate", { version: appUpdateVersion })
      : appUpdateStatus === "update_available"
        ? t("settings.updateAvailable", { version: appUpdateVersion })
        : appUpdateStatus === "downloading"
          ? t("settings.updateDownloading", {
            percent: appUpdateProgress?.percent === null || appUpdateProgress?.percent === undefined ? "--" : String(appUpdateProgress.percent),
            received: formatCacheSize(appUpdateProgress?.receivedBytes ?? 0),
            total: appUpdateProgress?.totalBytes ? formatCacheSize(appUpdateProgress.totalBytes) : "--"
          })
          : appUpdateStatus === "installing"
            ? t("settings.updateInstalling")
            : appUpdateStatus === "unsupported"
              ? t("settings.updateUnsupported")
          : appUpdateStatus === "download_failed"
            ? t("settings.updateDownloadFailed")
            : appUpdateStatus === "failed"
              ? t("settings.updateCheckFailed")
              : t("settings.updateNotChecked");
  const appUpdateButtonLabel = appUpdateStatus === "checking"
    ? t("settings.updateCheckingButton")
    : appUpdateStatus === "downloading"
      ? t("settings.updateDownloadingButton")
      : appUpdateStatus === "installing"
        ? t("settings.updateInstallingButton")
      : appUpdateStatus === "update_available" || appUpdateStatus === "download_failed" || appUpdateStatus === "unsupported"
        ? t("settings.downloadUpdateNow")
        : t("settings.checkForUpdates");
  const appUpdateButtonHint = appUpdateStatus === "update_available"
    || appUpdateStatus === "downloading"
    || appUpdateStatus === "installing"
    || appUpdateStatus === "download_failed"
    || appUpdateStatus === "unsupported"
    ? t("settings.downloadUpdateActionHint")
    : t("settings.checkForUpdatesActionHint");

  useEffect(() => {
    if (isScanning) {
      if (indexDetailsCollapseTimerRef.current !== null) {
        window.clearTimeout(indexDetailsCollapseTimerRef.current);
        indexDetailsCollapseTimerRef.current = null;
      }
      setIndexDetailsClosing(false);
      setIndexDetailsExpanded(true);
    }
  }, [isScanning]);

  useEffect(() => {
    if (directories.length > 0) return;
    if (directoriesCollapseTimerRef.current !== null) {
      window.clearTimeout(directoriesCollapseTimerRef.current);
      directoriesCollapseTimerRef.current = null;
    }
    setDirectoriesExpanded(false);
    setDirectoriesClosing(false);
  }, [directories.length]);

  useEffect(() => {
    if (!originVisible) return undefined;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOriginVisible(false);
    };

    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [originVisible]);

  useEffect(() => () => {
    if (originImageUrl) {
      URL.revokeObjectURL(originImageUrl);
    }
  }, [originImageUrl]);

  useEffect(() => window.imageEverything?.app.onUpdateDownloadProgress((progress) => {
    setAppUpdateProgress(progress);
    setAppUpdateStatus("downloading");
  }), []);

  const handleAppUpdateAction = async () => {
    if (appUpdateStatus === "checking" || appUpdateStatus === "downloading" || appUpdateStatus === "installing") return;
    if (appUpdateStatus === "update_available" || appUpdateStatus === "download_failed" || appUpdateStatus === "unsupported") {
      setAppUpdateProgress(null);
      setAppUpdateStatus("downloading");
      try {
        const result = await window.imageEverything?.app.downloadUpdate();
        setAppUpdateStatus(result?.status === "installing"
          ? "installing"
          : result?.status === "unsupported"
            ? "unsupported"
            : result?.status === "busy"
              ? "downloading"
              : "download_failed");
      } catch {
        setAppUpdateStatus("download_failed");
      }
      return;
    }

    setAppUpdateStatus("checking");
    try {
      const result = await window.imageEverything?.app.checkForUpdates();
      if (!result) {
        setAppUpdateStatus("failed");
        return;
      }
      setAppUpdateVersion(result.latestVersion || result.currentVersion);
      setAppUpdateStatus(result.status);
    } catch {
      setAppUpdateStatus("failed");
    }
  };

  const revealOrigin = async () => {
    if (originImageUrl) {
      setOriginVisible(true);
      return;
    }
    if (originLoadingRef.current) return;

    originLoadingRef.current = true;
    try {
      const encodedPayload = (await import("./assets/archive/phase7.dat?raw")).default.trim();
      const payloadText = window.atob(encodedPayload);
      const payload = new Uint8Array(payloadText.length);
      for (let index = 0; index < payloadText.length; index += 1) {
        payload[index] = payloadText.charCodeAt(index);
      }
      if (payload.byteLength <= 28) {
        throw new Error("Origin fragment is incomplete.");
      }

      const keyBytes = new Uint8Array([
        0x8f, 0x3a, 0x1c, 0x7d, 0x5e, 0x29, 0xb6, 0x40,
        0xd2, 0xa4, 0x7f, 0x11, 0x9b, 0xc8, 0x65, 0x30,
        0xe7, 0x1d, 0x4a, 0x9f, 0x26, 0x0b, 0x5c, 0x83,
        0xf8, 0xd1, 0x42, 0x6e, 0xa9, 0x50, 0x3b, 0x7c
      ]);
      const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: payload.slice(0, 12) },
        key,
        payload.slice(12)
      );
      const nextImageUrl = URL.createObjectURL(new Blob([decrypted], { type: "image/png" }));
      setOriginImageUrl(nextImageUrl);
      setOriginVisible(true);
    } catch {
      originSequenceRef.current = { count: 0, lastClickAt: 0 };
    } finally {
      originLoadingRef.current = false;
    }
  };

  const handleEchoClick = () => {
    const now = performance.now();
    const sequence = originSequenceRef.current;
    const count = now - sequence.lastClickAt <= 850 ? sequence.count + 1 : 1;
    originSequenceRef.current = { count, lastClickAt: now };
    if (count < 7) return;

    originSequenceRef.current = { count: 0, lastClickAt: 0 };
    void revealOrigin();
  };

  const updateAppearanceColor = (key: keyof AppearanceColors, value: string) => {
    if (!isHexColor(value)) return;
    onAppearanceColorsChange({
      ...appearanceColors,
      [key]: value.toUpperCase()
    });
  };

  const previewAppearanceColor = (key: keyof AppearanceColors, value: string) => {
    if (!isHexColor(value)) return;
    onAppearanceColorsPreview({
      ...appearanceColors,
      [key]: value.toUpperCase()
    });
  };

  const resetAppearanceColors = () => {
    onAppearanceColorsChange(defaultAppearanceColors);
  };

  useEffect(() => {
    setShortcutActionDrafts(shortcutActions);
    setDraftUnavailableActionIds([]);
  }, [shortcutActions]);

  useEffect(() => () => {
    void onShortcutCaptureEnd();
  }, [onShortcutCaptureEnd]);

  const startShortcutCapture = async (shortcutActionId: ShortcutActionId) => {
    if (await onShortcutCaptureStart()) {
      setCapturingShortcutActionId(shortcutActionId);
    }
  };

  const finishShortcutCapture = async (syncDraftAvailability = true) => {
    setCapturingShortcutActionId(null);
    const availability = await onShortcutCaptureEnd();
    if (syncDraftAvailability) {
      setDraftUnavailableActionIds(availability.unavailableActionIds);
    }
  };

  const updateShortcutAction = async (shortcutActionId: ShortcutActionId, shortcut: string) => {
    const nextShortcutActions = {
      ...shortcutActionDrafts,
      [shortcutActionId]: shortcut
    };
    setShortcutActionDrafts(nextShortcutActions);

    const hasInternalConflict = getShortcutActionItems().some((item) => (
      item.id !== shortcutActionId && nextShortcutActions[item.id] === shortcut
    ));
    if (hasInternalConflict) {
      setDraftUnavailableActionIds([shortcutActionId]);
      return;
    }

    const result = await onShortcutActionsChange(nextShortcutActions);
    if (!result) {
      setDraftUnavailableActionIds([shortcutActionId]);
      return;
    }
    if (result.applied) {
      setShortcutActionDrafts(normalizeShortcutActions(result.preferences.shortcutActions));
      setDraftUnavailableActionIds([]);
      return;
    }
    setDraftUnavailableActionIds(result.unavailableActionIds);
  };

  const resetShortcutActions = async () => {
    if (capturingShortcutActionId) {
      await finishShortcutCapture();
    }
    setShortcutActionDrafts(defaultShortcutActions);
    const result = await onShortcutActionsChange(defaultShortcutActions);
    setDraftUnavailableActionIds(result?.applied ? [] : result?.unavailableActionIds ?? []);
  };

  const closeShortcutConfiguration = async () => {
    if (capturingShortcutActionId) {
      await finishShortcutCapture();
    }
    setShortcutActionDrafts(shortcutActions);
    setDraftUnavailableActionIds([]);
    if (quickActionsClosing) {
      return;
    }
    setQuickActionsClosing(true);
    const collapseDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    quickActionsCollapseTimerRef.current = window.setTimeout(() => {
      onQuickActionsExpandedChange(false);
      setQuickActionsClosing(false);
      quickActionsCollapseTimerRef.current = null;
    }, collapseDuration);
  };

  const closeQuickCommands = () => {
    if (quickCommandsClosing) {
      return;
    }
    setQuickCommandsClosing(true);
    const collapseDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    quickCommandsCollapseTimerRef.current = window.setTimeout(() => {
      onQuickCommandsExpandedChange(false);
      setQuickCommandsClosing(false);
      quickCommandsCollapseTimerRef.current = null;
    }, collapseDuration);
  };

  const toggleRuntimeDetails = () => {
    if (runtimeDetailsClosing) {
      return;
    }
    if (!runtimeDetailsExpanded) {
      setRuntimeDetailsExpanded(true);
      return;
    }
    setRuntimeDetailsClosing(true);
    const collapseDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    runtimeDetailsCollapseTimerRef.current = window.setTimeout(() => {
      setRuntimeDetailsExpanded(false);
      setRuntimeDetailsClosing(false);
      runtimeDetailsCollapseTimerRef.current = null;
    }, collapseDuration);
  };

  const toggleSkimDisplayConfiguration = () => {
    if (skimDisplayClosing) return;
    if (!skimDisplayExpanded) {
      setSkimDisplayExpanded(true);
      return;
    }
    setSkimDisplayClosing(true);
    const collapseDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    skimDisplayCollapseTimerRef.current = window.setTimeout(() => {
      setSkimDisplayExpanded(false);
      setSkimDisplayClosing(false);
      skimDisplayCollapseTimerRef.current = null;
    }, collapseDuration);
  };

  const closeIndexDetails = () => {
    if (isScanning || indexDetailsClosing) return;
    setIndexDetailsClosing(true);
    const collapseDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    indexDetailsCollapseTimerRef.current = window.setTimeout(() => {
      setIndexDetailsExpanded(false);
      setIndexDetailsClosing(false);
      indexDetailsCollapseTimerRef.current = null;
    }, collapseDuration);
  };

  const toggleDirectories = () => {
    if (directoriesClosing) return;
    if (!directoriesExpanded) {
      setDirectoriesExpanded(true);
      return;
    }
    onCancelDirectoryEdit();
    setDirectoriesClosing(true);
    const collapseDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    directoriesCollapseTimerRef.current = window.setTimeout(() => {
      setDirectoriesExpanded(false);
      setDirectoriesClosing(false);
      directoriesCollapseTimerRef.current = null;
    }, collapseDuration);
  };

  useEffect(() => () => {
    if (quickActionsCollapseTimerRef.current !== null) {
      window.clearTimeout(quickActionsCollapseTimerRef.current);
    }
    if (quickCommandsCollapseTimerRef.current !== null) {
      window.clearTimeout(quickCommandsCollapseTimerRef.current);
    }
    if (runtimeDetailsCollapseTimerRef.current !== null) {
      window.clearTimeout(runtimeDetailsCollapseTimerRef.current);
    }
    if (skimDisplayCollapseTimerRef.current !== null) {
      window.clearTimeout(skimDisplayCollapseTimerRef.current);
    }
    if (indexDetailsCollapseTimerRef.current !== null) {
      window.clearTimeout(indexDetailsCollapseTimerRef.current);
    }
    if (directoriesCollapseTimerRef.current !== null) {
      window.clearTimeout(directoriesCollapseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!capturingShortcutActionId) return undefined;

    const handleShortcutCapture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        void finishShortcutCapture();
        return;
      }

      const nextShortcut = getShortcutFromKeyboardEvent(event);
      if (!nextShortcut) return;

      const shortcutActionId = capturingShortcutActionId;
      setCapturingShortcutActionId(null);
      void updateShortcutAction(shortcutActionId, nextShortcut).finally(() => {
        void finishShortcutCapture(false);
      });
    };

    window.addEventListener("keydown", handleShortcutCapture, true);
    return () => window.removeEventListener("keydown", handleShortcutCapture, true);
  }, [capturingShortcutActionId, shortcutActionDrafts]);

  return (
    <>
    <main className="settings-view cap-settings-view" data-settings-view="true" onClick={() => setSelectedIndexStat(null)}>
      <Cap7CESearchCapsule
        search={search}
        directoryName={directoryName}
        directories={searchDirectories}
        labelVisibility={labelVisibility}
        status={status}
        inputFeedback={quickCommandNotice}
        inputFeedbackIsGuide={inputFeedbackIsGuide}
        inputRef={searchInputRef}
        unified
        skimDisplayMode={skimDisplay.searchMode}
        enabledLabelGroups={standardSearchLabelGroups}
        onSearchChange={onSearchChange}
        onLabelVisibilityChange={onLabelVisibilityChange}
        onSkimDisplayModeChange={(searchMode) => onSkimDisplayChange({ ...skimDisplay, searchMode })}
        onSearchOptionsChange={onSearchOptionsChange}
        onSearch={onSearch}
      />

      <div className="cap-settings-scroll-frame cap-scroll-viewport-frame cap-scroll-viewport-frame-vertical">
        <div className="cap-settings-stage cap-main-scroll-viewport" ref={settingsScrollRef}>
          <div className="cap-settings-stack">
        <div className="cap-settings-title">Set: Cap7CE</div>
        <section className="cap-settings-group cap-settings-group-source">
          <div className="cap-settings-row cap-settings-row-source">
            <span className="cap-settings-label">{t("settings.recognitionStatus")}</span>
            {indexStatItems.map((item) => (
              <button
                key={item.status}
                className={`cap-settings-pill cap-settings-stat${selectedIndexStat === item.status ? " selected" : ""}`}
                type="button"
                title={item.title}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedIndexStat(item.status);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onOpenIndexView(item.status);
                }}
              >
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </button>
            ))}
          </div>

          <div className="cap-settings-row cap-settings-row-directory-config">
            <span className="cap-settings-label">{t("settings.directoryConfig")}</span>
            <span className="cap-settings-value">{directoryServiceUnavailable ? t("common.unavailable") : isLoadingDirectories ? t("settings.directoryLoading") : directories.length === 0 ? t("settings.directoryEmpty") : t("settings.directoryCount", { count: directories.length })}</span>
            <button className="cap-settings-pill" type="button" onClick={onStartAdd} title={t("settings.addDirectoryActionHint")} disabled={isAddingDirectory}>{t("common.add")}</button>
            <button
              className="cap-settings-pill cap-settings-expand-toggle"
              type="button"
              onClick={toggleDirectories}
              title={directoriesExpanded ? t("settings.collapseDirectoriesHint") : t("settings.expandDirectoriesHint")}
              disabled={isLoadingDirectories || directoryServiceUnavailable || directories.length === 0}
              aria-expanded={directoriesExpanded}
            >
              {directoriesExpanded ? t("common.collapse") : t("common.manage")}
            </button>
          </div>

          <div className="cap-settings-row cap-settings-row-directory-actions">
            <span className="cap-settings-label">{t("settings.index")}</span>
            <button
              className="cap-settings-pill"
              type="button"
              onClick={isScanning && aiProgress?.cancellable === true ? onCancelRecognition : indexFailed ? onRetryIndex : onContinueRecognition}
              title={isScanning && aiProgress?.cancellable === true ? t("settings.cancelRecognitionActionHint") : indexFailed ? t("settings.retryIndexActionHint") : t("settings.continueRecognitionActionHint")}
              disabled={isScanning ? aiProgress?.cancellable !== true || isCancellingRecognition : !indexFailed && indexStats.unrecognizedImages === 0}
            >
              {isScanning && aiProgress?.cancellable === true ? isCancellingRecognition ? t("settings.cancellingRecognition") : t("common.cancel") : indexFailed ? t("common.retry") : t("settings.continueRecognition")}
            </button>
            <button className="cap-settings-pill" type="button" onClick={onUpdateAll} title={isScanning ? indexStatusLabel : t("settings.updateAllActionHint")} disabled={isScanning}>
              {isScanning ? indexIsRecognizing ? t("settings.recognizing") : t("settings.scanning") : t("settings.updateAll")}
            </button>
          </div>

          {indexDetailsExpanded && hasIndexDetails && (
            <div className={`cap-settings-expandable-shell${indexDetailsClosing ? " is-closing" : ""}`}>
              <div className="cap-settings-expandable-inner">
                <div className="cap-settings-quick-actions-panel cap-settings-index-panel">
              <div className="cap-settings-quick-actions-header">
                <span className="cap-settings-label">{t("settings.indexStatus")}</span>
                {!isScanning && (
                  <div className="cap-settings-quick-actions-controls">
                    <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={closeIndexDetails} title={t("settings.collapseIndexDetailsHint")} aria-expanded="true">{t("common.collapse")}</button>
                  </div>
                )}
              </div>
              <div className="ai-details-grid">
                <span>{t("settings.indexStage")}</span>
                <strong>{indexStatusLabel}</strong>
                <span>{t("settings.indexProgress")}</span>
                <strong>{indexProgressCurrent} / {indexProgressTotal}</strong>
                <span>{t("settings.indexSuccessCount")}</span>
                <strong>{indexCompletedCount}</strong>
                <span>{t("settings.indexFailureCount")}</span>
                <strong>{indexFailedCount}</strong>
                {aiProgress?.currentFileName && (
                  <>
                    <span>{t("settings.indexCurrentFile")}</span>
                    <strong title={aiProgress.currentFileName}>{aiProgress.currentFileName}</strong>
                  </>
                )}
                {indexErrorSummary && (
                  <>
                    <span>{t("settings.indexErrorSummary")}</span>
                    <strong title={indexErrorSummary}>{indexErrorSummary}</strong>
                  </>
                )}
              </div>
                </div>
              </div>
            </div>
          )}

          {directoriesExpanded && !isLoadingDirectories && directories.length > 0 && (
            <div className={`cap-settings-expandable-shell${directoriesClosing ? " is-closing" : ""}`}>
              <div className="cap-settings-expandable-inner">
                <div className="cap-settings-directory-list">
              {directories.map((directory) => (
              <div className="cap-settings-row cap-settings-directory-row" key={directory.id}>
                {editingDirectoryId === directory.id ? (
                  <input
                    className="cap-settings-inline-input"
                    autoFocus
                    defaultValue={directory.name}
                    onBlur={(event) => {
                      if (event.currentTarget.dataset.cancelled === "true") return;
                      onDirectoryNameChange(directory.id, event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget.dataset.cancelled = "true";
                        onCancelDirectoryEdit();
                        return;
                      }
                      if (event.key === "Enter") onDirectoryNameChange(directory.id, event.currentTarget.value);
                    }}
                  />
                ) : (
                  <button className="cap-settings-pill cap-settings-directory-name" type="button" onDoubleClick={() => onEditDirectory(directory.id)} title={t("settings.renameDirectoryHint")}>
                    {directory.name}
                  </button>
                )}
                <span className="cap-settings-value cap-settings-path" title={directory.path}>{directory.path}</span>
                <span className="cap-settings-pill" title={t("settings.directoryFileCountHint")}>{directory.fileCount ?? "…"}{directory.scanStatus === "missing" || directory.scanStatus === "error" ? ` ${t("common.abnormal")}` : ""}</span>
                <button className="cap-settings-pill" type="button" onClick={() => onRecognizeDirectory(directory.id)} title={t("settings.recognizeDirectoryActionHint")} disabled={isScanning}>
                  {t("settings.recognizeDirectory")}
                </button>
                <button className="cap-settings-pill" type="button" onClick={() => onDeleteDirectory(directory.id)} title={t("settings.deleteDirectoryActionHint")} disabled={isScanning}>
                  {t("common.delete")}
                </button>
              </div>
              ))}
                </div>
              </div>
            </div>
          )}

          <div className="cap-settings-row cap-settings-row-cache">
            <span className="cap-settings-label">{t("settings.cacheManagement")}</span>
            <span className="cap-settings-value">
              {cacheOptimizationStatusLabel}
            </span>
            <button
              className="cap-settings-pill"
              type="button"
              title={thumbnailOptimizationStatus.enabled ? t("settings.disableCacheOptimizationHint") : t("settings.enableCacheOptimizationHint")}
              disabled={isClearingCache}
              onClick={() => onAutoCacheOptimizationChange(!thumbnailOptimizationStatus.enabled)}
            >
              {thumbnailOptimizationStatus.enabled ? t("settings.cacheOptimizationOn") : t("settings.cacheOptimizationOff")}
            </button>
            <button className="cap-settings-pill" type="button" onClick={onClearCache} title={t("settings.clearAllCacheActionHint")} disabled={isLoadingCacheStats || isClearingCache || (visualCacheStats.totalBytes === 0 && thumbnailOptimizationStatus.phase !== "running")}>
              {isClearingCache ? t("settings.clearingCache") : t("settings.clearAllCache")}
            </button>
          </div>
          <div className="cap-settings-row">
            <span className="cap-settings-label">{t("settings.skimCache")}</span>
            <span className="cap-settings-value">
              {skimCacheInlineFeedback || t("settings.cacheStats", { count: skimCacheStats.cacheCount, size: formatCacheSize(skimCacheStats.totalBytes) })}
            </span>
            <button
              className="cap-settings-pill"
              type="button"
              onClick={onClearSkimCache}
              title={t("settings.clearSkimCacheActionHint")}
              disabled={isLoadingCacheStats || isClearingSkimCache || skimCacheStats.totalBytes === 0}
            >
              {isClearingSkimCache ? t("settings.clearingCache") : t("settings.clearSkimCache")}
            </button>
          </div>
        </section>

        <section className="cap-settings-group cap-settings-split cap-settings-group-preferences">
          <div className="cap-settings-row">
            <span className="cap-settings-label">{t("settings.language")}</span>
            <button className="cap-settings-pill" type="button" onClick={() => onLanguageChange(getNextLanguagePreference(languagePreference))} title={t("settings.changeLanguageHint")}>
              {getLanguagePreferenceLabel(languagePreference)}
            </button>
          </div>
          <div className="cap-settings-row">
            <span className="cap-settings-label">{t("appearance.themeModeLabel")}</span>
            <button className="cap-settings-pill" type="button" onClick={() => onThemeChange(getNextThemeMode(theme))} title={t("settings.changeThemeHint")}>
              {getSettingsThemeLabels()[theme]}
            </button>
          </div>
          <div className="cap-settings-row cap-settings-wide">
            <span className="cap-settings-label">{t("appearance.configureLabel")}</span>
            <button
              ref={themeColorButtonRef}
              className="cap-settings-pill"
              type="button"
              title={t("settings.editThemeColorHint")}
              onClick={() => setActiveColorPicker("themeColor")}
            >
              {t("appearance.themeColor")} {currentAppearanceColors.themeColor}
            </button>
            <button
              ref={accentColorButtonRef}
              className="cap-settings-pill"
              type="button"
              style={{
                "--chip-bg-hover": "var(--accent-color)",
                "--focus-border": "var(--accent-color)",
                "--theme-on-color": getTextColorForBackground(currentAppearanceColors.accentColor)
              } as CSSProperties}
              title={t("settings.editAccentColorHint")}
              onClick={() => setActiveColorPicker("accentColor")}
            >
              {t("appearance.accentColor")} {currentAppearanceColors.accentColor}
            </button>
            <button className="cap-settings-pill" type="button" onClick={resetAppearanceColors} title={t("settings.resetAppearanceHint")}>{t("common.restoreDefault")}</button>
          </div>
        </section>

        <section className="cap-settings-group cap-settings-split cap-settings-group-display">
          <div className="cap-settings-row">
            <span className="cap-settings-label">{t("settings.standbyLine")}</span>
            <button className="cap-settings-pill" type="button" onClick={() => onStandbyLineVisibleChange(!standbyLineVisible)} title={standbyLineVisible ? t("settings.hideStandbyLineHint") : t("settings.showStandbyLineHint")}>
              {standbyLineVisible ? t("settings.visible") : t("settings.hidden")}
            </button>
          </div>
          <div className="cap-settings-row">
            <span className="cap-settings-label">{t("settings.edgeSnap")}</span>
            <button className="cap-settings-pill" type="button" onClick={() => onEdgeSnapChange(!edgeSnapEnabled)} title={edgeSnapEnabled ? t("settings.disableEdgeSnapHint") : t("settings.enableEdgeSnapHint")}>
              {edgeSnapEnabled ? t("settings.enabled") : t("settings.disabled")}
            </button>
          </div>
          <div className="cap-settings-row cap-settings-row-half">
            <span className="cap-settings-label">{t("settings.launchAtLogin")}</span>
            <button className="cap-settings-pill" type="button" onClick={() => onLaunchAtLoginChange(!launchAtLogin)} title={launchAtLogin ? t("settings.disableLaunchAtLoginHint") : t("settings.enableLaunchAtLoginHint")}>
              {launchAtLogin ? t("settings.launchAtLoginOn") : t("settings.launchAtLoginOff")}
            </button>
          </div>
          <div className="cap-settings-row cap-settings-row-half">
            <span className="cap-settings-label">{t("settings.operationHints")}</span>
            <button className="cap-settings-pill" type="button" onClick={() => onOperationHintsChange(!operationHintsEnabled)} title={operationHintsEnabled ? t("settings.disableOperationHintsHint") : t("settings.enableOperationHintsHint")}>
              {operationHintsEnabled ? t("settings.operationHintsOn") : t("settings.operationHintsOff")}
            </button>
          </div>
          <div className="cap-settings-row cap-settings-row-half">
            <span className="cap-settings-label">{t("settings.systemNotifications")}</span>
            <button className="cap-settings-pill" type="button" onClick={() => onSystemNotificationsChange(!systemNotificationsEnabled)} title={systemNotificationsEnabled ? t("settings.disableSystemNotificationsHint") : t("settings.enableSystemNotificationsHint")}>
              {systemNotificationsEnabled ? t("settings.systemNotificationsOn") : t("settings.systemNotificationsOff")}
            </button>
          </div>
        </section>

        <section className="cap-settings-group cap-settings-split cap-settings-group-actions">
          {skimDisplayExpanded ? (
            <div className={`cap-settings-expandable-shell${skimDisplayClosing ? " is-closing" : ""}`}>
              <div className="cap-settings-expandable-inner">
                <div className="cap-settings-skim-display-panel">
                  <div className="cap-settings-quick-actions-header cap-settings-skim-display-header">
                    <span className="cap-settings-label">{t("settings.skimDisplay")}</span>
                    <span className="cap-settings-value">
                      {t("settings.skimDisplaySummary", { selected: skimDisplay.customExtensions.length, total: fileFormatCapabilities.length })}
                    </span>
                    <div className="cap-settings-quick-actions-controls">
                      <button
                        className="cap-settings-pill"
                        type="button"
                        onClick={() => onSkimDisplayChange({ ...skimDisplay, showHiddenFiles: !skimDisplay.showHiddenFiles })}
                        title={skimDisplay.showHiddenFiles ? t("settings.hideHiddenFilesHint") : t("settings.showHiddenFilesHint")}
                      >
                        {skimDisplay.showHiddenFiles ? t("settings.hiddenFilesOn") : t("settings.hiddenFilesOff")}
                      </button>
                      <button
                        className="cap-settings-pill"
                        type="button"
                        onClick={() => updateCustomSkimExtensions([...skimDefaultFileExtensionSet])}
                        title={t("settings.resetSkimDisplayHint")}
                      >
                        {t("common.restoreDefault")}
                      </button>
                      <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={toggleSkimDisplayConfiguration} title={t("settings.finishSkimDisplayHint")} aria-expanded="true">
                        {t("settings.finishConfiguration")}
                      </button>
                    </div>
                  </div>
                  <div className="cap-settings-skim-format-groups">
                    {skimFormatGroups.map(({ category, extensions }) => {
                      const selectedCount = extensions.filter((extension) => selectedSkimExtensions.has(extension)).length;
                      return (
                        <section className="cap-settings-skim-format-group" key={category}>
                          <button
                            className="cap-settings-skim-category-heading"
                            type="button"
                            data-selected={selectedCount === extensions.length}
                            data-partial={selectedCount > 0 && selectedCount < extensions.length}
                            onClick={() => toggleSkimCategory(extensions)}
                            title={t("settings.toggleSkimCategoryHint")}
                            aria-label={t("settings.toggleSkimCategoryHint")}
                            aria-pressed={selectedCount === extensions.length ? true : selectedCount > 0 ? "mixed" : false}
                          >
                            <span className="cap-settings-skim-category-toggle" aria-hidden="true" />
                            <span>{t(`format.category.${category}` as TranslationKey)}</span>
                          </button>
                          <div className="cap-settings-skim-extensions">
                            {extensions.map((extension) => (
                              <button
                                className="cap-settings-pill cap-settings-skim-extension"
                                type="button"
                                key={extension}
                                data-selected={selectedSkimExtensions.has(extension)}
                                onClick={() => toggleSkimExtension(extension)}
                                title={t("settings.toggleSkimExtensionHint", { extension })}
                              >
                                {formatCompactExtensionLabel(extension)}
                              </button>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="cap-settings-row cap-settings-wide">
              <span className="cap-settings-label">{t("settings.skimDisplay")}</span>
              <span className="cap-settings-value">
                {t("settings.skimDisplaySummary", { selected: skimDisplay.customExtensions.length, total: fileFormatCapabilities.length })}
              </span>
              <button
                className="cap-settings-pill"
                type="button"
                onClick={() => onSkimDisplayChange({ ...skimDisplay, showHiddenFiles: !skimDisplay.showHiddenFiles })}
                title={skimDisplay.showHiddenFiles ? t("settings.hideHiddenFilesHint") : t("settings.showHiddenFilesHint")}
              >
                {skimDisplay.showHiddenFiles ? t("settings.hiddenFilesOn") : t("settings.hiddenFilesOff")}
              </button>
              <button
                className="cap-settings-pill"
                type="button"
                onClick={() => updateCustomSkimExtensions([...skimDefaultFileExtensionSet])}
                title={t("settings.resetSkimDisplayHint")}
              >
                {t("common.restoreDefault")}
              </button>
              <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={toggleSkimDisplayConfiguration} title={t("settings.configureSkimDisplayHint")} aria-expanded="false">{t("settings.configure")}</button>
            </div>
          )}
          {quickActionsExpanded ? (
            <div className={`cap-settings-expandable-shell${quickActionsClosing ? " is-closing" : ""}`}>
              <div className="cap-settings-expandable-inner">
                <div className="cap-settings-quick-actions-panel">
                  <div className="cap-settings-quick-actions-header">
                    <span className="cap-settings-label">{t("settings.quickActions")}</span>
                    <div className="cap-settings-quick-actions-controls">
                      <button className="cap-settings-pill" type="button" disabled={capturingShortcutActionId !== null} onClick={() => onQuickActionGlobalEnabledChange(!quickActionGlobalEnabled)} title={quickActionGlobalEnabled ? t("settings.disableQuickActionsHint") : t("settings.enableQuickActionsHint")}>
                        {quickActionGlobalEnabled ? t("settings.enabled") : t("settings.disabled")}
                      </button>
                      <button className="cap-settings-pill" type="button" onClick={resetShortcutActions} title={t("settings.resetQuickActionsHint")}>{t("common.restoreDefault")}</button>
                      <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={() => void closeShortcutConfiguration()} title={t("settings.finishQuickActionsHint")} aria-expanded="true">{t("settings.finishConfiguration")}</button>
                    </div>
                  </div>
                  <div className="cap-settings-quick-actions-list">
                    {getShortcutActionItems().map((item) => {
                      const isCapturing = capturingShortcutActionId === item.id;
                      const hasInternalConflict = getShortcutActionItems().some((otherItem) => (
                        otherItem.id !== item.id && shortcutActionDrafts[otherItem.id] === shortcutActionDrafts[item.id]
                      ));
                      const isUnavailable = hasInternalConflict || unavailableShortcutActionIds.includes(item.id) || draftUnavailableActionIds.includes(item.id);
                      return (
                        <div className="cap-settings-quick-action-row" key={item.id}>
                          <span className="cap-settings-quick-action-name">{item.name}</span>
                          {!isCapturing && isUnavailable && (
                            <span className="cap-settings-quick-action-hint unavailable">{t("settings.shortcutUnavailable")}</span>
                          )}
                          <div className="cap-settings-quick-action-controls">
                            <button
                              className="cap-settings-pill cap-settings-shortcut-pill"
                              type="button"
                              title={t("settings.editShortcutActionHint")}
                              onClick={() => {
                                if (!isCapturing) {
                                  void startShortcutCapture(item.id);
                                }
                              }}
                            >
                              {isCapturing ? t("settings.captureShortcut") : formatShortcutLabel(shortcutActionDrafts[item.id])}
                            </button>
                            {isCapturing && (
                              <button className="cap-settings-pill" type="button" onClick={() => void finishShortcutCapture()} title={t("settings.cancelShortcutCaptureHint")}>{t("common.cancel")}</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="cap-settings-row">
              <button className="cap-settings-pill" type="button" onClick={() => onQuickActionGlobalEnabledChange(!quickActionGlobalEnabled)} title={quickActionGlobalEnabled ? t("settings.disableQuickActionsHint") : t("settings.enableQuickActionsHint")}>
                {quickActionGlobalEnabled ? t("settings.enabled") : t("settings.disabled")}
              </button>
              <span className="cap-settings-label">{t("settings.quickActions")}</span>
              <button className="cap-settings-pill" type="button" onClick={resetShortcutActions} title={t("settings.resetQuickActionsHint")}>{t("common.restoreDefault")}</button>
              <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={() => onQuickActionsExpandedChange(true)} title={t("settings.configureQuickActionsHint")} aria-expanded="false">{t("settings.configure")}</button>
            </div>
          )}
          {quickCommandsExpanded ? (
            <div className={`cap-settings-expandable-shell${quickCommandsClosing ? " is-closing" : ""}`}>
              <div className="cap-settings-expandable-inner">
                <div className="cap-settings-quick-commands-panel">
                  <div className="cap-settings-quick-commands-header">
                    <span className="cap-settings-label">{t("settings.quickCommands")}</span>
                    <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={closeQuickCommands} title={t("settings.closeQuickCommandsHint")} aria-expanded="true">{t("settings.closeQuickCommands")}</button>
                  </div>
                  <div className="cap-settings-quick-command-groups">
                    {getQuickCommandGroups().map((group) => (
                      <section className="cap-settings-quick-command-group" key={group.title}>
                        <h3>{group.title}</h3>
                        <div className="cap-settings-quick-command-list">
                          {group.items.map((item) => (
                            <div className="cap-settings-quick-command-item" key={item.command}>
                              <span className="cap-settings-command-pill">{item.command}</span>
                              <span className="cap-settings-command-description">{item.description}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                    <section className="cap-settings-quick-command-group cap-settings-quick-command-danger" key="danger">
                      <h3>{t("settings.confirmationCommands")}</h3>
                      <p>{t("settings.confirmationCommandHint")}</p>
                      <div className="cap-settings-quick-command-list">
                        {getDangerousQuickCommandItems().map((item) => (
                          <div className="cap-settings-quick-command-item" key={item.command}>
                            <span className="cap-settings-command-pill">{item.command}</span>
                            <span className="cap-settings-command-description">{item.description}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="cap-settings-row">
              <span className="cap-settings-label">{t("settings.quickCommands")}</span>
              <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={() => onQuickCommandsExpandedChange(true)} title={t("settings.openQuickCommandsHint")} aria-expanded="false">{t("common.view")}</button>
            </div>
          )}
        </section>

        <section className="cap-settings-group cap-settings-split cap-settings-group-runtime">
          <div className="cap-settings-row cap-settings-wide">
            <span className="cap-settings-label">llama.cpp</span>
            <span className="cap-settings-value">
              {runtimeStatusLabel}
            </span>
            <SettingsSelect
              className="cap-settings-select-runtime"
              value={llamaRuntimeSettings.selectedVersion}
              disabled={isLoadingLlamaRuntime || isChangingLlamaRuntimeState || llamaRuntimeSettings.versions.length === 0 || llamaRuntimeProcessState.status === "starting" || llamaRuntimeProcessState.status === "running"}
              ariaLabel={t("settings.selectRuntime")}
              title={t("settings.selectRuntimeActionHint")}
              menuStyle={menuStyle}
              options={[
                { value: "", label: t("settings.selectVersion") },
                ...llamaRuntimeSettings.versions.map((runtime) => ({
                  value: runtime.version,
                  label: runtime.version
                }))
              ]}
              onChange={onLlamaRuntimeChange}
            />
            <button className="cap-settings-pill" type="button" onClick={onRefreshLlamaRuntime} title={t("settings.refreshRuntimeActionHint")} disabled={isLoadingLlamaRuntime}>
              {t("common.refresh")}
            </button>
            <button className="cap-settings-pill" type="button" onClick={isLlamaRuntimeRunning ? onStopLlamaRuntime : onStartLlamaRuntime} title={isLlamaRuntimeRunning ? t("settings.stopServerActionHint") : t("settings.startServerActionHint")} disabled={llamaRuntimeActionDisabled}>
              {isLlamaRuntimeStarting ? t("common.starting") : isLlamaRuntimeRunning ? t("common.stop") : t("common.start")}
            </button>
          </div>
          {runtimeErrorMessage && !runtimeHasMissingPrompt && <div className={`cap-settings-message cap-settings-wide${runtimeMessageIsFailure ? " is-error" : ""}`}>{runtimeErrorMessage}</div>}

          <div className="cap-settings-row cap-settings-wide">
            <span className="cap-settings-label">{t("settings.visionModel")}</span>
            <span className="cap-settings-value">
              {modelStatusLabel}
            </span>
            <SettingsSelect
              className="cap-settings-select-model"
              value={ggufModelSettings.selectedModelId}
              disabled={isLoadingGgufModels || isChangingLlamaRuntimeState || ggufModelSettings.models.length === 0 || llamaRuntimeProcessState.status === "starting" || llamaRuntimeProcessState.status === "running"}
              ariaLabel={t("settings.selectVisionModel")}
              title={t("settings.selectVisionModelActionHint")}
              menuStyle={menuStyle}
              options={[
                { value: "", label: t("settings.selectVisionModel") },
                ...ggufModelSettings.models.map((model) => ({
                  value: model.id,
                  label: model.name
                }))
              ]}
              onChange={onGgufModelChange}
            />
            <button className="cap-settings-pill" type="button" onClick={onRefreshGgufModels} title={t("settings.refreshGgufActionHint")} disabled={isLoadingGgufModels || llamaRuntimeProcessState.status === "starting"}>
              {isLoadingGgufModels ? t("common.refreshing") : t("common.refresh")}
            </button>
          </div>
          {modelErrorMessage && !modelHasMissingPrompt && <div className={`cap-settings-message cap-settings-wide${modelMessageIsFailure ? " is-error" : ""}`}>{modelErrorMessage}</div>}

          <div className="cap-settings-row">
            <span className="cap-settings-label">{t("settings.versionUpdate")}</span>
            <span className="cap-settings-value">
              {appUpdateStatusLabel}
            </span>
            <button
              className="cap-settings-pill"
              type="button"
              onClick={() => void handleAppUpdateAction()}
              title={appUpdateButtonHint}
              disabled={appUpdateStatus === "checking" || appUpdateStatus === "downloading" || appUpdateStatus === "installing"}
            >
              {appUpdateButtonLabel}
            </button>
          </div>

          <details className="cap-settings-details cap-settings-row cap-settings-wide" open={runtimeDetailsExpanded}>
            <summary
              aria-expanded={runtimeDetailsExpanded}
              title={runtimeDetailsExpanded ? t("settings.collapseDetailsHint") : t("settings.expandDetailsHint")}
              onClick={(event) => {
                event.preventDefault();
                toggleRuntimeDetails();
              }}
            >
              {t("settings.details")}
            </summary>
            {runtimeDetailsExpanded && (
              <div className={`cap-settings-expandable-shell${runtimeDetailsClosing ? " is-closing" : ""}`}>
                <div className="cap-settings-expandable-inner">
                  <div className="ai-details-grid">
              <span>{t("settings.runtimeFileStatus")}</span>
              <strong>{getLlamaRuntimeStatusLabel(llamaRuntimeSettings)}</strong>
              <span>{t("settings.runtimeDirectory")}</span>
              <strong title={llamaRuntimeSettings.runtimeRoot}>{llamaRuntimeSettings.runtimeRoot || t("common.notDetected")}</strong>
              <span>llama-server</span>
              <strong title={selectedLlamaRuntime?.serverPath}>{selectedLlamaRuntime?.serverPath || t("common.unselected")}</strong>
              {isLlamaRuntimeRunning && llamaRuntimeProcessState.port !== null && (
                <>
                  <span>{t("settings.serviceAddress")}</span>
                  <strong>{`http://${llamaRuntimeProcessState.host}:${llamaRuntimeProcessState.port}`}</strong>
                  <span>{t("settings.processPid")}</span>
                  <strong>{llamaRuntimeProcessState.pid ?? t("common.unknown")}</strong>
                  <span>{t("settings.runtimeStartedAt")}</span>
                  <strong>
                    {llamaRuntimeProcessState.startedAt
                      ? new Date(llamaRuntimeProcessState.startedAt).toLocaleString()
                      : t("common.unknown")}
                  </strong>
                </>
              )}
              <span>{t("settings.runtimeLog")}</span>
              <strong title={llamaRuntimeProcessState.logPath}>{llamaRuntimeProcessState.logPath || t("common.notCreated")}</strong>
              <span>{t("settings.modelDirectory")}</span>
              <strong title={ggufModelSettings.modelsRoot}>{ggufModelSettings.modelsRoot || t("common.notDetected")}</strong>
              <span>{t("settings.modelPath")}</span>
              <strong title={joinDisplayPath(ggufModelSettings.modelsRoot, selectedGgufModel?.modelFile.relativePath)}>
                {joinDisplayPath(ggufModelSettings.modelsRoot, selectedGgufModel?.modelFile.relativePath)}
              </strong>
              <span>{t("settings.mmprojFile")}</span>
              <strong title={joinDisplayPath(ggufModelSettings.modelsRoot, selectedGgufModel?.mmprojFile?.relativePath)}>
                {joinDisplayPath(ggufModelSettings.modelsRoot, selectedGgufModel?.mmprojFile?.relativePath)}
              </strong>
              <span>{t("settings.mainModelInfo")}</span>
              <strong>
                {selectedGgufModel
                  ? `${formatCacheSize(selectedGgufModel.modelFile.size)} / ${new Date(selectedGgufModel.modelFile.modifiedAt).toLocaleString()}`
                  : t("common.unselected")}
              </strong>
              <span>{t("settings.mmprojInfo")}</span>
              <strong>
                {selectedGgufModel?.mmprojFile
                  ? `${formatCacheSize(selectedGgufModel.mmprojFile.size)} / ${new Date(selectedGgufModel.mmprojFile.modifiedAt).toLocaleString()}`
                  : t("common.unselected")}
              </strong>
              <span>{t("settings.modelInventory")}</span>
              <strong>
                {`${ggufModelSettings.models.filter((model) => model.loadable).length} / ${ggufModelSettings.files.length}`}
              </strong>
                  </div>
                </div>
              </div>
            )}
          </details>
        </section>

        <div className="cap7ce-signature" aria-label="Cap7CE">
          <SvgIcon svg={iconSignatureCap7CESvg} className="cap-svg-icon cap-signature-svg-icon" />
          <small>
            <button
              className="cap7ce-release-link"
              type="button"
              title={t("settings.openReleasesHint")}
              aria-label={t("settings.openReleasesHint")}
              onClick={() => void window.imageEverything?.app.openReleasePage()}
            >
              0.8.3
            </button>
            {" · 7C93F3-L & "}
            <button
              className="cap7ce-echo-trigger"
              type="button"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                handleEchoClick();
              }}
            >
              Echo
            </button>
          </small>
        </div>
          </div>
        </div>
        <CustomScrollbar scrollContainerRef={settingsScrollRef} orientation="vertical" />
      </div>
    </main>
    {activeColorPicker && (
      <ColorPickerPopover
        key={activeColorPicker}
        anchorRef={activeColorPicker === "themeColor" ? themeColorButtonRef : accentColorButtonRef}
        value={currentAppearanceColors[activeColorPicker]}
        ariaLabel={activeColorPicker === "themeColor" ? t("appearance.themeColor") : t("appearance.accentColor")}
        menuStyle={menuStyle}
        onPreview={(value) => previewAppearanceColor(activeColorPicker, value)}
        onCommit={(value) => updateAppearanceColor(activeColorPicker, value)}
        onClose={() => setActiveColorPicker(null)}
      />
    )}
    {originVisible && originImageUrl && createPortal(
      <div
        className="cap7ce-origin-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Cap7CE origin"
        onClick={() => setOriginVisible(false)}
      >
        <figure className="cap7ce-origin-card">
          <img src={originImageUrl} alt="" />
          <figcaption>
            <span>一切始于一只找不到的狗。</span>
            <small>It began with a dog that could not be found.</small>
          </figcaption>
        </figure>
      </div>,
      document.body
    )}
    </>
  );
};

interface KeywordEditorCardProps {
  session: KeywordEditSession;
  keywords: string;
  error: string;
  isSaving: boolean;
  isClosing: boolean;
  menuStyle: CSSProperties;
  theme: ResolvedThemeMode;
  onKeywordsChange: (keywords: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onExitComplete: () => void;
}

const getDirectParentPath = (filePath: string) => {
  const normalizedPath = filePath.replace(/\//g, "\\");
  const separatorIndex = normalizedPath.lastIndexOf("\\");
  return separatorIndex >= 0 ? normalizedPath.slice(0, separatorIndex).toLocaleLowerCase() : "";
};

const KeywordEditorCard = ({
  session,
  keywords,
  error,
  isSaving,
  isClosing,
  menuStyle,
  theme,
  onKeywordsChange,
  onSave,
  onCancel,
  onExitComplete
}: KeywordEditorCardProps) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const composingRef = useRef(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const resizeTextarea = useCallback((textarea: HTMLTextAreaElement) => {
    const maxHeight = getKeywordEditorTextareaMaximumHeight(window.innerHeight);
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const card = cardRef.current;
    if (!textarea || !card) return;
    resizeTextarea(textarea);
    const bounds = card.getBoundingClientRect();
    setPosition(centerFloatingCardPosition(
      { width: bounds.width, height: bounds.height },
      { width: window.innerWidth, height: window.innerHeight }
    ));
  }, [keywords, resizeTextarea]);

  useEffect(() => {
    const handleResize = () => {
      const card = cardRef.current;
      if (!card) return;
      const bounds = card.getBoundingClientRect();
      setPosition(centerFloatingCardPosition(
        { width: bounds.width, height: bounds.height },
        { width: window.innerWidth, height: window.innerHeight }
      ));
    };
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleResize);
    if (cardRef.current) resizeObserver?.observe(cardRef.current);
    window.addEventListener("resize", handleResize);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!position || !textareaRef.current) return undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [position]);

  const firstItem = session.items[0];
  const isSingle = session.mode === "single";
  const formatCounts = new Map<string, number>();
  for (const item of session.items) {
    const format = item.extension.slice(1).toUpperCase() || t("fileInfo.file");
    formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1);
  }
  const formatComposition = [...formatCounts.entries()]
    .map(([format, count]) => `${count} ${format}`)
    .join(" / ");
  const directoryCount = new Set(session.items.map((item) => getDirectParentPath(item.filePath))).size;
  const compactFormatComposition = formatCounts.size <= 3
    ? formatComposition
    : t("keywords.formatCount", { count: formatCounts.size });
  const headerTooltip = isSingle
    ? [
      firstItem.fileName,
      formatCacheSize(firstItem.fileSize),
      ...(firstItem.imageWidth > 0 && firstItem.imageHeight > 0
        ? [t("fileInfo.resolution", { width: firstItem.imageWidth, height: firstItem.imageHeight })]
        : [])
    ].join("\n")
    : [
      t("keywords.selectedCount", { count: session.items.length }),
      t("keywords.directoryCount", { count: directoryCount }),
      formatComposition
    ].join("\n");
  const splitFileName = splitMiddleEllipsisFileName(firstItem.fileName);

  return createPortal(
    <div
      ref={cardRef}
      className={`context-menu context-menu-${theme} keyword-editor-card${isClosing ? " is-closing" : ""}`}
      data-context-menu="true"
      data-keyword-editor="true"
      style={{
        ...menuStyle,
        left: position?.left ?? window.innerWidth / 2,
        top: position?.top ?? window.innerHeight / 2,
        visibility: position ? "visible" : "hidden"
      }}
      role="dialog"
      aria-modal="false"
      aria-label={t("context.editKeywords")}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div
        className="cap7ce-menu-motion-surface keyword-editor-card-surface"
        onAnimationEnd={(event) => {
          if (isClosing && event.animationName === "cap7ce-keyword-card-exit") onExitComplete();
        }}
      >
        <div className="context-menu-file-header keyword-editor-card-header" title={headerTooltip}>
          {isSingle ? (
            <>
              <div className="context-menu-file-heading">
                <span className="context-menu-file-format">{firstItem.extension.slice(1).toUpperCase() || t("fileInfo.file")}</span>
                <span className="context-menu-file-primary-detail">{formatCacheSize(firstItem.fileSize)}</span>
              </div>
              <span className="context-menu-file-name">
                <span className="context-menu-file-name-leading">{splitFileName.leading}</span>
                {splitFileName.trailing && <span className="context-menu-file-name-trailing">{splitFileName.trailing}</span>}
              </span>
            </>
          ) : (
            <>
              <div className="context-menu-file-heading">
                <span className="context-menu-file-format keyword-editor-multi-heading">
                  {t("keywords.selectedCount", { count: session.items.length })}
                </span>
                <span className="context-menu-file-primary-detail">
                  {t("keywords.directoryCount", { count: directoryCount })}
                </span>
              </div>
              <span className="context-menu-file-name keyword-editor-format-composition">{compactFormatComposition}</span>
            </>
          )}
        </div>
        <textarea
          ref={textareaRef}
          className="keyword-editor-textarea"
          value={keywords}
          onChange={(event) => onKeywordsChange(event.target.value)}
          onInput={(event) => resizeTextarea(event.currentTarget)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (isKeywordEditorCancelKey(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
              return;
            }
            const nativeEvent = event.nativeEvent as KeyboardEvent;
            if (shouldSubmitKeywordEditor({
              key: event.key,
              isComposing: nativeEvent.isComposing || composingRef.current,
              repeat: nativeEvent.repeat
            })) {
              event.preventDefault();
              event.stopPropagation();
              onSave();
            }
          }}
          disabled={isSaving || isClosing}
          placeholder={t("keywords.placeholder")}
          aria-label={t("keywords.label")}
        />
        {error && <div className="keyword-editor-error" role="alert">{error}</div>}
      </div>
    </div>,
    document.body
  );
};

const DeleteFilesPanel = ({
  isDeleting,
  fileCount,
  feedback,
  onConfirm,
  onCancel,
  onComplete
}: {
  isDeleting: boolean;
  fileCount: number;
  feedback: DeleteFilesFeedback | null;
  onConfirm: () => void;
  onCancel: () => void;
  onComplete: () => void;
}) => (
  <main className="keyword-editor-view delete-files-view">
    <section className="keyword-editor-panel delete-files-panel" role="dialog" aria-modal="true" aria-label={t("delete.fileDialogTitle")}>
      <div className="delete-files-content">
        {isDeleting
          ? <WaitingIndicator className="delete-files-waiting-icon" />
          : <SvgIcon svg={warningGradientSvg} className="cap-svg-icon delete-files-warning-icon" />}
        <div className="delete-files-message">
          {isDeleting
            ? t("delete.movingToTrash", { count: fileCount })
            : feedback?.status === "failed"
              ? t("delete.failedCount", { count: feedback.failedCount })
              : feedback?.status === "succeeded"
                ? t("delete.completed")
                : t("delete.fileQuestion")}
        </div>
        <div className="modal-actions">
          <button type="button" disabled={isDeleting} onClick={onCancel}>{t("common.cancel")}</button>
          <button type="button" disabled={isDeleting} onClick={feedback?.status === "succeeded" ? onComplete : onConfirm}>
            {feedback?.status === "failed" ? t("common.retry") : feedback?.status === "succeeded" ? t("common.done") : t("common.delete")}
          </button>
        </div>
      </div>
    </section>
  </main>
);

const DeleteDirectoryPanel = ({
  onConfirm,
  onCancel
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <main className="keyword-editor-view delete-files-view">
    <section className="keyword-editor-panel delete-files-panel" role="dialog" aria-modal="true" aria-label={t("delete.directoryDialogTitle")}>
      <div className="delete-files-content">
        <SvgIcon svg={warningGradientSvg} className="cap-svg-icon delete-files-warning-icon" />
        <div className="delete-files-message">{t("delete.directoryQuestion")}</div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>{t("common.confirmNo")}</button>
          <button type="button" onClick={onConfirm}>{t("common.confirmYes")}</button>
        </div>
      </div>
    </section>
  </main>
);

const AddDroppedDirectoriesPanel = ({
  directories,
  isAdding,
  onConfirm,
  onCancel
}: {
  directories: DroppedDirectory[];
  isAdding: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <main className="keyword-editor-view delete-files-view">
    <section className="keyword-editor-panel delete-files-panel" role="dialog" aria-modal="true" aria-label={t("directoryAdd.dropDialogTitle")}>
      <div className="delete-files-content">
        <SvgIcon svg={warningGradientSvg} className="cap-svg-icon delete-files-warning-icon" />
        <div className="delete-files-message">
          {directories.length === 1
            ? t("directoryAdd.dropSingleQuestion", { name: directories[0].name })
            : t("directoryAdd.dropMultipleQuestion", { count: directories.length })}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={isAdding}>{t("common.cancel")}</button>
          <button type="button" onClick={onConfirm} disabled={isAdding}>{t("common.confirm")}</button>
        </div>
      </div>
    </section>
  </main>
);

const ReplaceDirectoriesPanel = ({
  conflictCount,
  replacedCount,
  isAdding,
  onConfirm,
  onCancel
}: {
  conflictCount: number;
  replacedCount: number;
  isAdding: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <main className="keyword-editor-view delete-files-view">
    <section className="keyword-editor-panel delete-files-panel" role="dialog" aria-modal="true" aria-label={t("directoryAdd.replaceDialogTitle")}>
      <div className="delete-files-content">
        <SvgIcon svg={warningGradientSvg} className="cap-svg-icon delete-files-warning-icon" />
        <div className="delete-files-message">
          {t("directoryAdd.replaceQuestion", { candidates: conflictCount, count: replacedCount })}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={isAdding}>{t("common.confirmNo")}</button>
          <button type="button" onClick={onConfirm} disabled={isAdding}>{t("common.confirmYes")}</button>
        </div>
      </div>
    </section>
  </main>
);

const ClearCachePanel = ({
  isClearing,
  feedback,
  skim = false,
  onConfirm,
  onCancel,
  onComplete
}: {
  isClearing: boolean;
  feedback: CacheClearFeedback | null;
  skim?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onComplete: () => void;
}) => (
  <main className="keyword-editor-view delete-files-view">
    <section className="keyword-editor-panel delete-files-panel" role="dialog" aria-modal="true" aria-label={skim ? t("cache.skimDialogTitle") : t("cache.dialogTitle")}>
      <div className="delete-files-content">
        <SvgIcon svg={warningGradientSvg} className="cap-svg-icon delete-files-warning-icon" />
        <div className="delete-files-message">
          {feedback?.status === "failed" ? feedback.message : feedback?.status === "succeeded" ? t("cache.completed") : (
            <>
              {skim ? t("cache.skimRegenerationHint") : t("cache.regenerationHint")}<br />
              {t("cache.clearQuestion")}
            </>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" disabled={isClearing} onClick={onCancel}>{t("common.cancel")}</button>
          <button type="button" disabled={isClearing} onClick={feedback?.status === "succeeded" ? onComplete : onConfirm}>
            {feedback?.status === "failed" ? t("common.retry") : feedback?.status === "succeeded" ? t("common.done") : t("settings.clearCache")}
          </button>
        </div>
      </div>
    </section>
  </main>
);

export default App;
