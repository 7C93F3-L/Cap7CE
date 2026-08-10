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
  skimActive: boolean;
  theme: ResolvedThemeMode;
  language: ResolvedLanguage;
  appearanceColors: AppearanceColors;
}

export interface PdfPreviewMetadata {
  pageCount: number;
  defaultPageWidth: number;
  defaultPageHeight: number;
}

export interface PreviewWindowControlState {
  isMaximized: boolean;
  isAlwaysOnTop: boolean;
  miniStandardHeight: number;
}

export interface PreviewContentSize {
  sessionId: string;
  filePath: string;
  width: number;
  height: number;
}

export type ShortcutActionId =
  | "activateCapsule"
  | "activateMicro"
  | "activateMini"
  | "activateNormal"
  | "activateStandby"
  | "activateSkim"
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

export type RecognitionStatusFilter = "all" | "recognized" | "unrecognized";

export type RecognitionFailureType = "parse" | "file" | "pending";

export type DirectoryScanStatus = "pending" | "ready" | "missing" | "error";

export interface DirectoryItem {
  id: string;
  name: string;
  path: string;
  indexedCount: number;
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

export interface FileFormatCapability {
  extension: string;
  category: FileFormatCategory;
  iconName: string;
  canBrowse: boolean;
  defaultInSkim: boolean;
  canIndex: boolean;
  canSearch: boolean;
  canThumbnail: boolean;
  previewKind: FilePreviewKind;
  canDirectPreview: boolean;
  canAIIndex: boolean;
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

export interface SkimPreviewInfo {
  kind: "file" | "folder";
  name: string;
  path: string;
  extension: string;
  size: number;
  modifiedAt: string;
  withinAddedDirectory: boolean;
}

export interface SkimTextPreview {
  content: string;
  encoding: "utf-8" | "utf-16le" | "utf-16be";
  truncated: boolean;
}

export interface SkimFolderStats {
  fileCount: number;
  folderCount: number;
  totalSize: number;
  skippedCount: number;
  status: "scanning" | "completed" | "cancelled";
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
  fileSize: number;
  createdAt: string;
  modifiedAt: string;
  imageWidth: number;
  imageHeight: number;
  caption: string;
  keywords: string[];
  aiError: string;
  manualIndex: boolean;
  failureType: RecognitionFailureType;
  failureLabel: string;
  indexedAt: string;
  thumbnailUrl: string;
}

export interface UnrecognizedFailureStats {
  parseFailures: number;
  fileFailures: number;
}

export interface ImageSearchResponse {
  images: ImageIndexItem[];
  availableFormats: string[];
  unrecognizedCount: number;
  skippedUnrecognizedCount: number;
  failureStats: UnrecognizedFailureStats;
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
  recognitionStatus: RecognitionStatusFilter;
}

export interface SearchLabelVisibilityPreferences {
  directory: boolean;
  recognition: boolean;
  sort: boolean;
  format: boolean;
  skimDisplay: boolean;
}

export type SkimDisplayMode = "skim" | "all" | "custom";

export interface SkimDisplayPreferences {
  mode: SkimDisplayMode;
  customExtensions: string[];
  showHiddenFiles: boolean;
}

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
  edgeSnapEnabled: boolean;
  alwaysOnTop: boolean;
  standbyLineVisible: boolean;
  launchAtLogin: boolean;
  systemNotificationsEnabled: boolean;
  backgroundRunNotificationShown: boolean;
  operationHintsEnabled: boolean;
  autoCacheOptimizationEnabled: boolean;
  quickActionGlobalEnabled: boolean;
  commandEnabled: boolean;
  searchLabelVisibility: SearchLabelVisibilityPreferences;
  skimDisplay: SkimDisplayPreferences;
  shortcutActions: ShortcutActionPreferences;
  updatedAt: string;
}

export interface ImageScanDirectoryResult {
  directory_id: string;
  directory_path: string;
  status: "ready" | "missing" | "error";
  file_count: number;
  image_count: number;
  skipped_files: number;
  skipped_directories: number;
  error?: string;
}

export interface ImageScanResponse {
  directories: DirectoryItem[];
  imageCount: number;
  scanResultPath: string;
  results: ImageScanDirectoryResult[];
  ai?: AiIndexResponse;
  removedFilePaths?: string[];
}

export interface IndexQualityStats {
  totalImages: number;
  recognizedImages: number;
  unrecognizedImages: number;
}

export interface VisualCacheStats {
  cacheCount: number;
  totalBytes: number;
  cachePaths: string[];
}

export interface ThumbnailOptimizationStatus {
  enabled: boolean;
  phase: "disabled" | "ready" | "running" | "completed";
  queuedCount: number;
  processedCount: number;
  failedCount: number;
  activeDurationMs: number;
}

export type AiIndexPhase = "idle" | "checking" | "processing" | "completed" | "failed" | "cancelled";

export interface AiIndexProgress {
  phase: AiIndexPhase;
  total: number;
  current: number;
  currentFileName?: string;
  completed: number;
  failed: number;
  totalUnrecognized?: number;
  remainingUnrecognized?: number;
  cancellable?: boolean;
  message?: string;
}

export interface AiIndexResponse {
  total: number;
  completed: number;
  failed: number;
  cancelled?: boolean;
  errors: Array<{
    filePath: string;
    fileName: string;
    message: string;
  }>;
}

export interface AiIndexRunResponse {
  ai: AiIndexResponse;
  stats: IndexQualityStats;
  removedFilePaths?: string[];
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
