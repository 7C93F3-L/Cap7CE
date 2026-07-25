export type AppView = "home" | "results" | "settings";

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

export interface PreviewWindowData {
  sessionId: string;
  itemId: string;
  filePath: string;
  fileName: string;
  previewUrl: string;
  thumbnailUrl: string;
  theme: ResolvedThemeMode;
  language: ResolvedLanguage;
  appearanceColors: AppearanceColors;
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

export interface ImageIndexItem {
  id: string;
  filePath: string;
  fileName: string;
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
}

export interface UserPreferences {
  themePreference: ThemeMode;
  languagePreference: LanguagePreference;
  sortPreference: {
    sortField: SortField;
    sortDirection: SortDirection;
  };
  appearanceColors: AppearanceColors;
  edgeSnapEnabled: boolean;
  alwaysOnTop: boolean;
  standbyLineVisible: boolean;
  launchAtLogin: boolean;
  operationHintsEnabled: boolean;
  autoCacheOptimizationEnabled: boolean;
  quickActionGlobalEnabled: boolean;
  commandEnabled: boolean;
  searchLabelVisibility: SearchLabelVisibilityPreferences;
  shortcutActions: ShortcutActionPreferences;
  updatedAt: string;
}

export interface ImageScanDirectoryResult {
  directory_id: string;
  directory_path: string;
  status: "ready" | "missing" | "error";
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
