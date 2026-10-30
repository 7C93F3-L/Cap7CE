import type { SkimTextPreview } from "./textPreviewTypes";
export type { SkimTextPreview } from "./textPreviewTypes";
import type { SkimPreviewInfo, SkimFolderStats } from "./sourceInformationTypes";
export type { SkimPreviewInfo, SkimFolderStats } from "./sourceInformationTypes";
import type { SearchModifiedTimeRange, SearchTimePreset } from "../../core/node/resourceCatalog/domain/formats/searchFilters";
import type { SearchImageAnimationMode, SearchImageAspectRatio, SearchImageAspectRatioValue, SearchImageColorTrait, SearchImageDimensionFilter, SearchVisualColor } from "../../core/node/resourceCatalog/domain/formats/imageSearchFilters";
import type { SearchVideoAspectRatio, SearchVideoAspectRatioValue, SearchVideoColorTrait, SearchVideoDimensionFilter, SearchVideoDurationPreset, SearchVideoDurationRange, SearchVideoResolution, SearchVideoVisualColor } from "../../core/node/resourceCatalog/domain/formats/videoSearchFilters";
import type { SearchAudioChannel, SearchAudioDurationPreset, SearchAudioDurationRange } from "../../core/node/resourceCatalog/domain/formats/audioSearchFilters";
import type { SearchFileSizePreset, SearchFileSizeRange } from "../../core/node/resourceCatalog/domain/formats/fileSizeSearchFilters";
import type { SearchDocumentContentCountPreset, SearchDocumentContentCountRange, SearchDocumentImageComposition } from "../../core/node/resourceCatalog/domain/formats/documentSearchFilters";
import type { SearchArtboardCountPreset } from "../../core/node/resourceCatalog/domain/formats/artboardSearchFilters";
import type { SearchThreeDModelType, SearchThreeDStructure, SearchThreeDTriangleCountPreset, SearchThreeDTriangleCountRange } from "../../core/node/resourceCatalog/domain/formats/threeDSearchFilters";
import type { SearchArchiveContentType, SearchArchiveEntryCountPreset, SearchArchiveEntryCountRange, SearchArchiveStructure } from "../../core/node/resourceCatalog/domain/formats/archiveSearchFilters";
import type { SearchFontCharacterSet, SearchFontKind, SearchFontStyle, SearchFontWeight } from "../../core/node/resourceCatalog/domain/formats/fontSearchFilters";
import type { SearchModelParameterCount, SearchModelPrecision } from "../../core/node/resourceCatalog/domain/formats/modelSearchFilters";
import type {
  SearchCountRange,
  SearchDataColumnCountPreset,
  SearchDataRecordCountPreset,
  SearchJsonRootKind,
  SearchTextCharacterCountPreset,
  SearchTextLineCountPreset
} from "../../core/node/resourceCatalog/domain/formats/textDataSearchFilters";

export type AppView = "home" | "results" | "skim" | "settings";

export type ThemeMode = "system" | "light" | "dark";

export type ResolvedThemeMode = "light" | "dark";
export type LanguagePreference = "system" | "zh-CN" | "en-US";
export type ResolvedLanguage = Exclude<LanguagePreference, "system">;

export interface AppearanceColors {
  themeColor: string;
  accentColor: string;
}

export type PreviewNavigateDirection = -1 | 1;

export type PreviewItemAction = "editKeywords" | "deleteFile";

export interface PreviewItemActionRequest {
  action: PreviewItemAction;
  itemId: string;
  filePath: string;
}

export interface PreviewManualKeywordsUpdate {
  sessionId: string;
  itemId: string;
  filePath: string;
  manualKeywords: string[];
}

export type PreviewEmbeddedMetadataKind =
  | "visual_content"
  | "embedded_title"
  | "embedded_subject"
  | "embedded_description"
  | "embedded_keywords"
  | "software_family"
  | "capture_device"
  | "media_title"
  | "media_artist"
  | "media_album"
  | "font_family"
  | "font_style";

export interface PreviewEmbeddedMetadata {
  items: Array<{ kind: PreviewEmbeddedMetadataKind; text: string }>;
  capturedAt: string | null;
}

export interface ArchivePreviewEntry {
  path: string;
  size: number | null;
  compressedSize: number | null;
  directory: boolean;
}

export interface ArchivePreviewData {
  entries: ArchivePreviewEntry[];
  entryCount: number;
  totalUncompressedSize: number;
  truncated: boolean;
}

export type ArchivePreviewFallbackReason =
  | "passwordRequired"
  | "invalidArchive"
  | "unsupportedArchive"
  | "tooLarge"
  | "timedOut"
  | "failed";

export interface FontVariationAxis {
  tag: string;
  minimum: number;
  defaultValue: number;
  maximum: number;
}

export interface FontPreviewData {
  familyName: string;
  styleName: string;
  weight: number;
  glyphCount: number;
  supportsLatinSample: boolean;
  supportsChineseSample: boolean;
  variationAxes: FontVariationAxis[];
}

export type FontPreviewFallbackReason = "invalidFont" | "tooLarge" | "timedOut" | "failed";
export interface EpubPreviewChapter { title: string; text: string }
export interface EpubPreviewData { title: string; creator: string; chapters: EpubPreviewChapter[]; navigationCount: number; skippedChapterCount: number; truncated: boolean; coverDataUrl: string | null }
export type EpubPreviewFallbackReason = "invalidEpub" | "encrypted" | "tooLarge" | "timedOut" | "failed";
export interface MobiPreviewChapter { title: string; text: string }
export interface MobiPreviewData { title: string; creator: string; chapters: MobiPreviewChapter[]; navigationCount: number; skippedChapterCount: number; truncated: boolean; coverDataUrl: string | null }
export type MobiPreviewFallbackReason = "invalidMobi" | "encrypted" | "unsupportedMobi" | "tooLarge" | "timedOut" | "failed";

export interface PreviewWindowData {
  sessionId: string;
  itemId: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  modifiedAt: string;
  previewUrl: string;
  thumbnailUrl: string;
  provider?: "image" | "fileInfo" | "folderInfo" | "text" | "audio" | "video" | "pdf" | "office" | "archive" | "font" | "epub" | "mobi";
  info?: SkimPreviewInfo;
  textPreview?: SkimTextPreview;
  pdfPreview?: PdfPreviewMetadata;
  archivePreview?: ArchivePreviewData;
  archiveFallbackReason?: ArchivePreviewFallbackReason;
  fontPreview?: FontPreviewData;
  fontFallbackReason?: FontPreviewFallbackReason;
  epubPreview?: EpubPreviewData;
  epubFallbackReason?: EpubPreviewFallbackReason;
  mobiPreview?: MobiPreviewData;
  mobiFallbackReason?: MobiPreviewFallbackReason;
  embeddedMetadata?: PreviewEmbeddedMetadata;
  imageWidth?: number;
  imageHeight?: number;
  manualKeywords?: string[];
  userDescription?: string;
  searchEvidence?: Pick<SearchResultEvidence, "terms" | "classification"> | null;
  skimActive: boolean;
  theme: ResolvedThemeMode;
  language: ResolvedLanguage;
  appearanceColors: AppearanceColors;
  sourceAuthorization?: {
    kind: "computer-search";
    taskId: string;
    authorizationId: string;
  };
}

export interface PdfPreviewMetadata {
  pageCount: number;
  defaultPageWidth: number;
  defaultPageHeight: number;
}

export interface PreviewWindowControlState {
  isMaximized: boolean;
  isAlwaysOnTop: boolean;
}

export interface PreviewContentSize {
  sessionId: string;
  filePath: string;
  width: number;
  height: number;
  sidebarWidth?: number;
}

export type ShortcutActionId =
  | "focusMainSearch"
  | "restoreDefaultWindow"
  | "hideToLine"
  | "toggleWindowMode"
  | "cycleDirectory"
  | "openSettings";

export type ShortcutActionPreferences = Record<ShortcutActionId, string>;

export interface ShortcutAvailabilityResult {
  unavailableActionIds: ShortcutActionId[];
}

export interface ShortcutActionsUpdateResult extends ShortcutAvailabilityResult {
  applied: boolean;
  preferences: UserPreferences;
}

export type SortField = "file_name" | "modified_at";

export type SortDirection = "asc" | "desc";

export type RecognitionFailureType = "parse" | "file" | "pending";

export type DirectoryScanStatus = "pending" | "ready" | "missing" | "error";

export interface DirectoryItem {
  id: string;
  name: string;
  path: string;
  indexedCount: number;
  fileCount: number | null;
  createdAt: string;
  updatedAt: string;
  lastScannedAt?: string;
  scanStatus?: DirectoryScanStatus;
  scanError?: string;
}

export type DirectoryAddConflictResolution = "prompt" | "replace-existing";

export interface DirectoryAddRequest {
  candidates: string[];
  conflictResolution?: DirectoryAddConflictResolution;
}

export type DirectoryAddIgnoreReason =
  | "drive-root"
  | "duplicate-candidate"
  | "covered-by-candidate"
  | "already-added"
  | "covered-by-existing";

export interface DirectoryAddIgnoredItem {
  inputPath: string;
  directoryPath?: string;
  reason: DirectoryAddIgnoreReason;
  existingDirectory?: DirectoryItem;
}

export type DirectoryAddFailureReason = "invalid-candidate" | "not-found" | "unavailable";

export interface DirectoryAddFailure {
  inputPath: string;
  reason: DirectoryAddFailureReason;
  message: string;
}

export interface DirectoryAddConflict {
  candidatePath: string;
  existingDirectories: DirectoryItem[];
}

export interface DirectoryAddReplacement {
  directory: DirectoryItem;
  replacedDirectories: DirectoryItem[];
}

export interface DirectoryAddResult {
  directories: DirectoryItem[];
  added: DirectoryItem[];
  ignored: DirectoryAddIgnoredItem[];
  conflicts: DirectoryAddConflict[];
  replacements: DirectoryAddReplacement[];
  failures: DirectoryAddFailure[];
  cancelled: boolean;
}

export type SkimBrowseEntryKind = "drive" | "folder" | "file";

export type FileFormatCategory = "visual" | "text" | "document" | "data" | "archive" | "audio" | "video" | "font" | "threeD" | "project" | "model";
export type FilePreviewKind = "image" | "fileInfo" | "text" | "audio" | "video" | "pdf" | "office" | "archive" | "font" | "epub" | "mobi";
export type NaturalFileKind = "image" | "vector" | "designSource" | "video" | "audio" | "document" | "text" | "data" | "archive" | "font" | "threeD" | "model";

export interface FileFormatCapability {
  extension: string;
  category: FileFormatCategory;
  iconName: string;
  canBrowse: boolean;
  defaultInSkim: boolean;
  canIndex: boolean;
  canSearch: boolean;
  canThumbnail: boolean;
  canShellPreview: boolean;
  previewKind: FilePreviewKind;
  canDirectPreview: boolean;
  canAIIndex: boolean;
  naturalSearchKinds: readonly NaturalFileKind[];
}

export interface SkimBrowseEntry {
  kind: SkimBrowseEntryKind;
  name: string;
  path: string;
  extension: string;
  label?: string;
  size: number | null;
  modifiedAt: string | null;
  withinAddedDirectory: boolean;
  hidden: boolean;
  formatCapability?: FileFormatCapability;
  status: "ready" | "loading" | "error";
  error?: string;
}

export interface SkimBreadcrumb {
  name: string;
  path: string;
}

export interface SkimBrowseOptions {
  query: string;
  fileFormat: string;
  sortField: "name" | "modifiedAt";
  sortDirection: "asc" | "desc";
}

export interface SkimReadRequest {
  taskId: string;
  path: string | null;
  options: SkimBrowseOptions;
}

export interface SkimReadResponse {
  taskId: string;
  currentPath: string | null;
  breadcrumbs: SkimBreadcrumb[];
  entries: SkimBrowseEntry[];
  cancelled: boolean;
}

export type SkimLocationShortcutKind =
  | "computer"
  | "desktop"
  | "downloads"
  | "documents"
  | "pictures"
  | "music"
  | "videos"
  | "starred";

export interface SkimLocationShortcut {
  id: string;
  kind: SkimLocationShortcutKind;
  path: string | null;
  name?: string;
}

export interface SkimFolderStatsUpdate extends SkimFolderStats {
  sessionId: string;
  path: string;
}

export interface ImageIndexItem {
  id: string;
  resultKind: "visual" | "file";
  filePath: string;
  fileName: string;
  extension: string;
  iconName: string;
  previewKind: FilePreviewKind;
  canShellPreview: boolean;
  fileSize: number;
  createdAt: string;
  modifiedAt: string;
  imageWidth: number;
  imageHeight: number;
  caption: string;
  keywords: string[];
  aiKeywords: string[];
  userDescription: string;
  isRecognized: boolean;
  aiError: string;
  failureType: RecognitionFailureType;
  failureLabel: string;
  indexedAt: string;
  thumbnailUrl: string;
  searchEvidence: SearchResultEvidence | null;
}

export type SearchEvidenceSource =
  | "userKeyword"
  | "userDescription"
  | "fileName"
  | "fileExtension"
  | "fileCategory"
  | "modifiedTime"
  | "imageOrientation"
  | "imageAspectRatio"
  | "visualPropertyStrong"
  | "relativeDirectory"
  | "rootDirectoryName"
  | "directoryDisplayName"
  | "embeddedMetadata"
  | "aiKeyword"
  | "aiCaption"
  | "visualPropertySoft"
  | "aiSearch";

export type SearchEvidenceClass = "userMetadata" | "fileName" | "fileFormat" | "naturalCondition" | "directoryPath" | "embeddedMetadata" | "aiMetadata" | "visualSimilarity" | "aiDeepMatch";

export interface SearchTermEvidence {
  term: string;
  sources: SearchEvidenceSource[];
  bestSource: SearchEvidenceSource;
}

export interface SearchResultEvidence {
  terms: SearchTermEvidence[];
  classification: SearchEvidenceClass;
  weakestSource: SearchEvidenceSource;
  policy: "weakest-required-vector-v1" | "ai-search-beta-v1" | "ai-search-cascade-v1";
  embeddedMatches: Array<{ term: string; kind: string; snippet: string }>;
}

export interface ImageSearchResponse {
  images: ImageIndexItem[];
  availableFormats: string[];
}

export interface KeywordBatchUpdateTarget {
  filePath: string;
}

export interface KeywordBatchUpdateRequest {
  targets: KeywordBatchUpdateTarget[];
  initialCommonKeywords: string[];
  targetKeywordText: string;
}

export interface KeywordBatchUpdateResult {
  success: boolean;
  totalCount: number;
  failedCount: number;
  errorMessage: string;
  normalizedKeywordText: string;
}

export interface DeleteFileFailure {
  path: string;
  error: string;
}

export interface DeleteFilesResult {
  success: boolean;
  totalCount: number;
  deletedPaths: string[];
  failedItems: DeleteFileFailure[];
}

export interface SearchState {
  query: string;
  directoryId: string;
  fileFormat: string;
  sortField: SortField;
  sortDirection: SortDirection;
  includedExtensions?: string[];
  selectedExtensions?: string[];
  unclassifiedOnly?: boolean;
  timePreset?: SearchTimePreset;
  modifiedTimeRange?: SearchModifiedTimeRange;
  fileSizePreset?: SearchFileSizePreset;
  fileSizeRange?: SearchFileSizeRange;
  visualColors?: SearchVisualColor[];
  imageColorTraits?: SearchImageColorTrait[];
  imageAspectRatios?: SearchImageAspectRatio[];
  imageAspectRatioValues?: SearchImageAspectRatioValue[];
  imageDimensionFilter?: SearchImageDimensionFilter;
  imageAnimation?: SearchImageAnimationMode;
  videoDurationPreset?: SearchVideoDurationPreset;
  videoDurationRange?: SearchVideoDurationRange;
  videoAspectRatios?: SearchVideoAspectRatio[];
  videoAspectRatioValues?: SearchVideoAspectRatioValue[];
  videoResolutions?: SearchVideoResolution[];
  videoDimensionFilter?: SearchVideoDimensionFilter;
  videoVisualColors?: SearchVideoVisualColor[];
  videoColorTraits?: SearchVideoColorTrait[];
  audioDurationPreset?: SearchAudioDurationPreset;
  audioDurationRange?: SearchAudioDurationRange;
  audioChannels?: SearchAudioChannel[];
  documentContentCountPreset?: SearchDocumentContentCountPreset;
  documentContentCountRange?: SearchDocumentContentCountRange;
  documentImageComposition?: SearchDocumentImageComposition;
  artboardCountPreset?: SearchArtboardCountPreset;
  artboardCountRange?: SearchCountRange;
  textCharacterCountPreset?: SearchTextCharacterCountPreset;
  textCharacterCountRange?: SearchCountRange;
  textLineCountPreset?: SearchTextLineCountPreset;
  textLineCountRange?: SearchCountRange;
  csvRecordCountPreset?: SearchDataRecordCountPreset;
  csvRecordCountRange?: SearchCountRange;
  csvColumnCountPreset?: SearchDataColumnCountPreset;
  csvColumnCountRange?: SearchCountRange;
  jsonItemCountPreset?: SearchDataRecordCountPreset;
  jsonItemCountRange?: SearchCountRange;
  jsonRootKind?: SearchJsonRootKind;
  threeDModelTypes?: SearchThreeDModelType[];
  threeDStructures?: SearchThreeDStructure[];
  threeDTriangleCountPreset?: SearchThreeDTriangleCountPreset;
  threeDTriangleCountRange?: SearchThreeDTriangleCountRange;
  archiveContentTypes?: SearchArchiveContentType[];
  archiveEntryCountPreset?: SearchArchiveEntryCountPreset;
  archiveEntryCountRange?: SearchArchiveEntryCountRange;
  archiveStructures?: SearchArchiveStructure[];
  fontWeights?: SearchFontWeight[];
  fontStyles?: SearchFontStyle[];
  fontCharacterSets?: SearchFontCharacterSet[];
  fontKinds?: SearchFontKind[];
  modelParameterCounts?: SearchModelParameterCount[];
  modelPrecisions?: SearchModelPrecision[];
}

export interface SearchLabelVisibilityPreferences {
  directory: boolean;
  sort: boolean;
  format: boolean;
  skimDisplay: boolean;
  ai: boolean;
}

export type SkimDisplayMode = "skim" | "all" | "custom";

export interface SkimDisplayPreferences {
  mode: SkimDisplayMode;
  searchMode: SkimDisplayMode;
  customExtensions: string[];
  showHiddenFiles: boolean;
}

export type WindowMaterial = "acrylic" | "mica";
export type UiFontSize = 12 | 13 | 14 | 15 | 16;

export interface UserPreferences {
  themePreference: ThemeMode;
  languagePreference: LanguagePreference;
  sortPreference: {
    sortField: SortField;
    sortDirection: SortDirection;
  };
  skimSortPreference: {
    sortField: SortField;
    sortDirection: SortDirection;
  };
  appearanceColors: AppearanceColors;
  edgeCollapseEnabled: boolean;
  windowMaterial: WindowMaterial;
  uiFontSize: UiFontSize;
  alwaysOnTop: boolean;
  standbyLineVisible: boolean;
  launchAtLogin: boolean;
  systemNotificationsEnabled: boolean;
  backgroundRunNotificationShown: boolean;
  autoCacheOptimizationEnabled: boolean;
  quickActionGlobalEnabled: boolean;
  commandEnabled: boolean;
  searchLabelVisibility: SearchLabelVisibilityPreferences;
  skimDisplay: SkimDisplayPreferences;
  skimSidebarFolders: string[];
  skimSystemLocationsCollapsed: boolean;
  stableShortcutActions: ShortcutActionPreferences;
  updatedAt: string;
}

export interface VisualCacheStats {
  cacheCount: number;
  totalBytes: number;
  cachePaths: string[];
}

export interface ThumbnailOptimizationStatus {
  enabled: boolean;
  phase: "disabled" | "ready" | "discovering" | "running" | "completed";
  queuedCount: number;
  processedCount: number;
  failedCount: number;
  activeDurationMs: number;
}

export interface RuntimeDiagnosticsInfo {
  logDirectory: string;
  crashDirectory: string;
  runtimeLogPath: string;
  detailedLoggingEnabled: boolean;
}

export type RuntimeDiagnosticsExportResult =
  | { status: "exported"; filePath: string }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

export interface EmbeddedMetadataTaskStatus {
  phase: "idle" | "running" | "cancelling" | "completed" | "cancelled" | "failed";
  totalCount: number;
  queuedCount: number;
  processedCount: number;
  indexedCount: number;
  emptyCount: number;
  failedCount: number;
  activeDurationMs: number;
}

export type LlamaRuntimeStatus =
  | "available"
  | "unselected"
  | "missing_root"
  | "missing_server"
  | "selection_missing";

export interface LlamaRuntimeVersion {
  version: string;
  directoryPath: string;
  serverPath: string;
}

export interface LlamaRuntimeSettings {
  versions: LlamaRuntimeVersion[];
  selectedVersion: string;
  status: LlamaRuntimeStatus;
  message?: string;
  runtimeRoot: string;
  configPath: string;
}

export type LlamaRuntimeProcessStatus = "stopped" | "starting" | "running" | "failed";
export type GgufModelLoadStatus = "unselected" | "unpaired" | "ready" | "loading" | "loaded" | "load_failed";

export interface LlamaRuntimeProcessState {
  status: LlamaRuntimeProcessStatus;
  host: string;
  port: number | null;
  selectedVersion: string;
  pid?: number;
  startedAt?: string;
  message?: string;
  modelStatus: GgufModelLoadStatus;
  selectedModelId: string;
  loadedModelName?: string;
  modelMessage?: string;
  healthUrl: string;
  logPath: string;
}

export type GgufModelFileKind = "model" | "mmproj";
export type GgufModelPairingStatus = "paired" | "missing_mmproj";
export type GgufModelSettingsStatus =
  | "ready"
  | "unselected"
  | "unpaired"
  | "missing_directory"
  | "selection_missing";

export interface GgufModelFile {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
  kind: GgufModelFileKind;
}

export interface GgufVisionModel {
  id: string;
  name: string;
  modelFile: GgufModelFile;
  mmprojFile?: GgufModelFile;
  pairingStatus: GgufModelPairingStatus;
  loadable: boolean;
  message?: string;
}

export interface GgufModelSettings {
  files: GgufModelFile[];
  models: GgufVisionModel[];
  selectedModelId: string;
  status: GgufModelSettingsStatus;
  message?: string;
  modelsRoot: string;
  configPath: string;
}
