import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, net, protocol, screen, shell, Tray, type OpenDialogOptions } from "electron";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { addDirectoryCandidates, createCancelledDirectoryAddResult, type DirectoryAddRequest, type DirectoryAddResult } from "./directoryAddService";
import { checkForAppUpdate, type AppUpdateDownload } from "./appUpdateService";
import { applyDirectoryScanSummaries, deleteDirectory, listDirectories, replaceDirectories, type PersistedDirectory, updateDirectoryName } from "./directoryStore";
import { moveIndexedImagesToTrash } from "./fileOperationService";
import { startNativeFileDrag } from "./fileDragService";
import { getFileFormatCapability } from "./formatCapabilities";
import { getGgufModelSettings, updateSelectedGgufModel } from "./ggufModelStore";
import { searchImagesWithAddedDirectories } from "./imageSearchService";
import { isSupportedImageFilePath, scanImageDirectories, type ScannedImageFile } from "./imageScanner";
import { searchScanSnapshotService } from "./searchScanSnapshotService";
import { getLlamaRuntimeProcessState, onLlamaRuntimeProcessStateChanged, registerLlamaRuntimeShutdownHandler, startLlamaRuntime, stopLlamaRuntime, syncIdleLlamaRuntimeSelectionState } from "./llamaRuntimeManager";
import { getLlamaRuntimeSettings, updateSelectedLlamaRuntime } from "./llamaRuntimeStore";
import { runContinuousAiIndex } from "./llamaVisionIndexer";
import { cleanupRecognizedModelInputCaches } from "./modelInputCacheCleanupService";
import { getUserPreferences, markBackgroundRunNotificationShown, updateAlwaysOnTopPreference, updateAppearanceColorsPreference, updateAutoCacheOptimizationPreference, updateCommandEnabledPreference, updateEdgeSnapPreference, updateLanguagePreference, updateLaunchAtLoginPreference, updateOperationHintsPreference, updateQuickActionGlobalEnabledPreference, updateSearchLabelVisibilityPreference, updateShortcutActionsPreference, updateSkimDisplayPreference, updateSortPreference, updateStandbyLineVisiblePreference, updateSystemNotificationsPreference, updateThemePreference } from "./preferenceStore";
import { backfillFilePathEvidence, deleteDirectoryImages, ensureImageDatabase, getExistingImageCountsByDirectory, getImageDatabasePath, getImageIndexQualityStats, reassignDirectoryImages, updateImageKeywordsBatch, upsertImageManualMetadata, writeScannedImagesToIndex } from "./sqliteImageIndex";
import { cleanupMissingIndexedImages } from "./staleImageCleanupService";
import { cleanupMissingIndexedFiles } from "./staleFileCleanupService";
import { readSkimLocation } from "./skimBrowseService";
import { collectSkimFolderStats, inspectSkimEntry } from "./skimPreviewService";
import { getSkimMediaMimeType, parseSkimMediaByteRange, readSkimTextPreview, skimAudioPreviewExtensions, skimVideoPreviewExtensions } from "./skimContentPreviewService";
import { beginSkimVisualSession, cancelSkimVisualSession, clearSkimCacheSafely, getSkimCacheStats, requestSkimShellThumbnailCache, requestSkimVisualCache, setSkimShellThumbnailActivity } from "./skimVisualCacheService";
import { getBottomAnchoredInteractiveBounds, getShellMousePollDelay } from "./shellMousePollingPolicy";
import { clearAllVisualCaches, deleteThumbnailsForDirectory, deleteThumbnailsForImages, ensureThumbnailPath, getAllVisualCacheStats } from "./thumbnailService";
import { enqueueThumbnailOptimizationCandidates, getThumbnailOptimizationStatus, pauseThumbnailOptimization, resumeThumbnailOptimization, setThumbnailOptimizationEnabled, setThumbnailOptimizationSort, setThumbnailOptimizationStatusListener, type ThumbnailOptimizationCandidate, type ThumbnailOptimizationStatus } from "./thumbnailOptimizationService";
import { readVisualCacheImage } from "./visualCacheService";
import { ensurePreviewImagePath, shouldUseSourceFileForPreview } from "./visualRenderService";
import type { PreviewContentSize, PreviewItemActionRequest, PreviewNavigateDirection, PreviewWindowControlState, PreviewWindowData } from "./previewTypes";
import { formatKeywordText, normalizeKeywordList, parseKeywordText } from "./keywordRules";
import type { KeywordBatchUpdateRequest, KeywordBatchUpdateResult } from "./keywordTypes";
import { getActiveLanguage, resolveLanguagePreference, setActiveLanguage, t, type LanguagePreference } from "./localization";
import { lockWebContentsZoom } from "./webContentsZoomPolicy";

const applicationName = "Cap7CE";
const releasePageUrl = "https://github.com/7C93F3-L/Cap7CE/releases";
app.setName(applicationName);
app.setPath("userData", path.join(app.getPath("appData"), applicationName));

const applyLaunchAtLoginPreference = (launchAtLogin: boolean) => {
  if (process.platform !== "win32" || !app.isPackaged) {
    return;
  }
  app.setLoginItemSettings({
    openAtLogin: launchAtLogin,
    path: process.execPath
  });
};

let mainWindow: BrowserWindow | null = null;
let startupHintWindow: BrowserWindow | null = null;
let previewWindow: BrowserWindow | null = null;
let appTray: Tray | null = null;
let pendingAppUpdateDownload: AppUpdateDownload | null = null;
let isQuitting = false;
let cancelAiIndexRequested = false;
let resizeRepaintTimer: NodeJS.Timeout | null = null;
let resizeSettledTimer: NodeJS.Timeout | null = null;
let shellMousePassthroughTimer: NodeJS.Timeout | null = null;
let shellWorkAreaRefreshTimer: NodeJS.Timeout | null = null;
let lastShellMousePoint: Electron.Point | null = null;
let stationaryShellMousePollCount = 0;
let shellIgnoreMouseEvents = false;
let programmaticResizeGuardUntil = 0;
let moveSnapTimer: NodeJS.Timeout | null = null;
let programmaticMoveGuardUntil = 0;
let previewMoveSnapTimer: NodeJS.Timeout | null = null;
let previewProgrammaticMoveGuardUntil = 0;
let cacheClearAuthorization: { token: string; expiresAt: number } | null = null;
let skimCacheClearAuthorization: { token: string; expiresAt: number } | null = null;
let startupHintCloseTimer: NodeJS.Timeout | null = null;
let previewIdleDestroyTimer: NodeJS.Timeout | null = null;
let shellAlwaysOnTop = false;
let shellMaximized = false;
let lastNormalBounds: Electron.Rectangle | null = null;
let activeShellState: Cap7CEShellState = "standby";
let mainWindowSkipTaskbar: boolean | null = null;
let microBottomCenterAnchored = false;
let edgeSnapEnabled = true;
let standbyLineVisible = true;
let systemNotificationsEnabled = true;
let quickActionGlobalEnabled = true;
let shortcutCaptureActive = false;
let registeredActivateCapsuleShortcut: string | null = null;
const registeredShellModeShortcuts = new Map<string, string>();
type ShortcutActionId = "activateCapsule" | "activateMicro" | "activateMini" | "activateNormal" | "activateStandby" | "activateSkim" | "openSettings";
type GlobalShortcutActionId = ShortcutActionId;
type ShortcutActionPreferences = Record<ShortcutActionId, string>;
let unavailableGlobalShortcutActionIds = new Set<GlobalShortcutActionId>();
let modelInputCacheCleanupPromise: Promise<void> | null = null;
let rendererContentViewActive = false;
interface SearchTaskState {
  cancelled: boolean;
}
const searchTasks = new Map<string, SearchTaskState>();
let previewWindowLoaded = false;
let previewSessionActive = false;
let activePreviewData: PreviewWindowData | null = null;

const logPreviewLifecycle = (event: string, details: Record<string, unknown>) => {
  if (app.isPackaged) return;
  console.info(`[preview-lifecycle] ${new Date().toISOString()} ${event}`, details);
};
let latestPreviewContentSize: PreviewContentSize | null = null;
let activeSkimFolderStatsTask: { sessionId: string; path: string; cancelled: boolean } | null = null;
let latestSkimFolderStatsUpdate: ({ sessionId: string; path: string } & Awaited<ReturnType<typeof collectSkimFolderStats>>) | null = null;
let cacheNotificationBatchBaseline: Pick<ThumbnailOptimizationStatus, "processedCount" | "failedCount" | "activeDurationMs"> | null = null;
let lastCacheCompletionNotificationAt = 0;
const userMovedShellBounds = new Map<Cap7CEShellState, Electron.Rectangle>();
const previewSourceFallbackExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
type Cap7CEShellState = "standby" | "capsule" | "micro" | "mini" | "normal" | "settings";
const shellWindowStates = new Set<Cap7CEShellState>(["standby", "capsule", "micro", "mini", "normal", "settings"]);
const standbyVisualWidthPx = 180;
const standbyVisualHeightPx = 4;
const standbyInteractionHeightPx = 15;
const backgroundTaskNotificationMinimumMs = 60_000;
const cacheCompletionNotificationCooldownMs = 30 * 60_000;

const toThumbnailOptimizationCandidates = (images: ScannedImageFile[]): ThumbnailOptimizationCandidate[] => (
  images.map((image) => ({
    filePath: image.file_path,
    fileName: image.file_name,
    fileSize: image.file_size,
    modifiedAt: image.modified_at,
    modifiedMs: image.modified_ms
  }))
);

const enqueueScannedThumbnails = (images: ScannedImageFile[]) => {
  void enqueueThumbnailOptimizationCandidates(toThumbnailOptimizationCandidates(images)).catch((error) => {
    console.warn("[thumbnail-optimization] candidate filtering failed", error);
  });
};

const syncThumbnailOptimizationActivity = () => {
  const shouldRun = Boolean(
    rendererContentViewActive
    && mainWindow
    && !mainWindow.isDestroyed()
    && mainWindow.isVisible()
    && mainWindow.isFocused()
    && (activeShellState === "micro" || activeShellState === "mini" || activeShellState === "normal")
  );
  setSkimShellThumbnailActivity(shouldRun);
  searchScanSnapshotService.setActive(shouldRun);
  if (shouldRun) {
    resumeThumbnailOptimization("inactive-content");
    return;
  }
  void pauseThumbnailOptimization("inactive-content");
};

const cancelActiveSearchTasks = () => {
  for (const task of searchTasks.values()) {
    task.cancelled = true;
  }
};

const scheduleRecognizedModelInputCacheCleanup = () => {
  if (!getThumbnailOptimizationStatus().enabled || modelInputCacheCleanupPromise) {
    return modelInputCacheCleanupPromise ?? Promise.resolve();
  }

  modelInputCacheCleanupPromise = cleanupRecognizedModelInputCaches()
    .then((result) => {
      if (result.deletedCount > 0) {
        console.info("[model-input-cache] cleaned recognized cache entries", result);
      }
    })
    .catch((error) => {
      console.warn("[model-input-cache] historical cleanup failed", error);
    })
    .finally(() => {
      modelInputCacheCleanupPromise = null;
    });

  return modelInputCacheCleanupPromise;
};
const capsuleWidthPx = 300;
const capsuleVisualHeightPx = 30;
const capsuleWindowVerticalPaddingPx = 2;
const capsuleWindowHeightPx = capsuleVisualHeightPx + capsuleWindowVerticalPaddingPx * 2;
const microDefaultHeightPx = 156;
const miniDefaultHeightPx = 500;
const resizableShellMinimumWidthPx = 300;
const resizableShellMinimumHeightPx = microDefaultHeightPx;
const edgeGapPx = 5;
const microLayoutMaxHeight = 300;
const normalLayoutMinWidth = 1280;
const normalLayoutMinHeight = 760;
const resizeSettleDelayMs = 260;
const programmaticResizeGuardMs = 420;
const moveSnapSettleDelayMs = 180;
const edgeSnapThresholdPx = 40;
const edgeAnchorThresholdPx = 12;
const programmaticMoveGuardMs = 420;
const previewWindowMinimumWidth = 360;
const previewWindowMinimumHeight = 280;
const previewWindowHorizontalPadding = 50;
const previewWindowVerticalChrome = 24;
const previewWindowWorkAreaRatio = 0.85;
const previewWindowIdleDestroyDelayMs = 2 * 60_000;
const DEBUG_WINDOW_BOUNDS = true;

const isShellWindowState = (state: string): state is Cap7CEShellState => shellWindowStates.has(state as Cap7CEShellState);

const syncTaskbarVisibility = (state: Cap7CEShellState) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  const shouldSkipTaskbar = state !== "normal" && state !== "settings";
  if (mainWindowSkipTaskbar === shouldSkipTaskbar) return true;

  mainWindow.setSkipTaskbar(shouldSkipTaskbar);
  mainWindowSkipTaskbar = shouldSkipTaskbar;
  return true;
};

const closeStartupHintWindow = () => {
  if (startupHintCloseTimer !== null) {
    clearTimeout(startupHintCloseTimer);
    startupHintCloseTimer = null;
  }
  if (startupHintWindow && !startupHintWindow.isDestroyed()) {
    startupHintWindow.close();
  }
  startupHintWindow = null;
};

const sendActivePreviewData = () => {
  if (!previewWindowLoaded || !activePreviewData || !previewWindow || previewWindow.isDestroyed()) {
    return;
  }
  previewWindow.webContents.send("preview:data", activePreviewData);
  if (
    latestSkimFolderStatsUpdate
    && latestSkimFolderStatsUpdate.sessionId === activePreviewData.sessionId
  ) {
    previewWindow.webContents.send("skim:folderStats", latestSkimFolderStatsUpdate);
  }
};

const applyLanguagePreference = async (languagePreference: LanguagePreference) => {
  const preferences = await updateLanguagePreference(languagePreference);
  const resolvedLanguage = resolveLanguagePreference(preferences.languagePreference, app.getLocale());
  setActiveLanguage(resolvedLanguage);
  updateTrayMenu();
  mainWindow?.webContents.send("preferences:languageChanged", preferences.languagePreference, resolvedLanguage);
  if (activePreviewData) {
    activePreviewData = { ...activePreviewData, language: resolvedLanguage };
    sendActivePreviewData();
  }
  return preferences;
};

const revealPreviewWindow = () => {
  if (!previewSessionActive || !previewWindow || previewWindow.isDestroyed()) {
    return false;
  }
  const mainWasVisible = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());
  const previewWasVisible = previewWindow.isVisible();
  if (!previewWasVisible) {
    previewWindow.showInactive();
  }
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.hide();
  }
  applyAlwaysOnTopState();
  previewWindow.focus();
  previewWindow.moveTop();
  logPreviewLifecycle("reveal", {
    sessionId: activePreviewData?.sessionId ?? null,
    source: activePreviewData?.skimActive ? "skim" : "results",
    mainWasVisible,
    mainVisible: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()),
    previewWasVisible,
    previewVisible: previewWindow.isVisible()
  });
  return true;
};

const getPreviewWindowControlState = (): PreviewWindowControlState => ({
  isMaximized: Boolean(previewWindow && !previewWindow.isDestroyed() && previewWindow.isMaximized()),
  isAlwaysOnTop: shellAlwaysOnTop,
  miniStandardHeight: miniDefaultHeightPx
});

const clearPreviewIdleDestroyTimer = () => {
  if (previewIdleDestroyTimer !== null) {
    clearTimeout(previewIdleDestroyTimer);
    previewIdleDestroyTimer = null;
  }
};

const schedulePreviewIdleDestroy = () => {
  clearPreviewIdleDestroyTimer();
  if (!previewWindow || previewWindow.isDestroyed() || previewSessionActive) {
    return;
  }
  previewIdleDestroyTimer = setTimeout(() => {
    previewIdleDestroyTimer = null;
    if (!previewSessionActive && previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.destroy();
    }
  }, previewWindowIdleDestroyDelayMs);
};

const closePreviewSession = () => {
  if (activeSkimFolderStatsTask) {
    activeSkimFolderStatsTask.cancelled = true;
    activeSkimFolderStatsTask = null;
  }
  latestSkimFolderStatsUpdate = null;
  clearPreviewMoveSnapCheck();
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.webContents.send("preview:reset");
    previewWindow.hide();
    if (previewWindow.isMaximized()) {
      previewWindow.unmaximize();
    }
    previewWindow.setAlwaysOnTop(false);
  }

  const wasActive = previewSessionActive;
  previewSessionActive = false;
  activePreviewData = null;
  latestPreviewContentSize = null;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("preview:closed");
    if (wasActive) {
      mainWindow.show();
      applyAlwaysOnTopState();
      mainWindow.focus();
    }
  }

  schedulePreviewIdleDestroy();

  return wasActive;
};

const centerPreviewWindowForNewSession = () => {
  if (!previewWindow || previewWindow.isDestroyed()) {
    return false;
  }

  const display = mainWindow && !mainWindow.isDestroyed()
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay();
  const { workArea } = display;
  const { width, height } = previewWindow.getBounds();
  markPreviewProgrammaticMove();
  previewWindow.setPosition(
    workArea.x + Math.round((workArea.width - width) / 2),
    workArea.y + Math.round((workArea.height - height) / 2),
    false
  );
  return true;
};

const getPreviewWindowBounds = (contentWidth: number, contentHeight: number): Electron.Rectangle => {
  const currentPreviewBounds = previewWindow && !previewWindow.isDestroyed() && previewWindow.isVisible()
    ? previewWindow.getBounds()
    : null;
  const display = previewSessionActive && currentPreviewBounds
    ? screen.getDisplayMatching(currentPreviewBounds)
    : mainWindow
      ? screen.getDisplayMatching(mainWindow.getBounds())
      : screen.getPrimaryDisplay();
  const { workArea } = display;
  const maximumWidth = Math.max(1, Math.floor(workArea.width * previewWindowWorkAreaRatio));
  const maximumHeight = Math.max(1, Math.floor(workArea.height * previewWindowWorkAreaRatio));
  const minimumWidth = Math.min(previewWindowMinimumWidth, maximumWidth);
  const minimumHeight = Math.min(previewWindowMinimumHeight, maximumHeight);
  const availableContentWidth = Math.max(1, maximumWidth - previewWindowHorizontalPadding);
  const availableContentHeight = Math.max(1, maximumHeight - previewWindowVerticalChrome);
  const safeContentWidth = Math.max(1, Math.round(contentWidth));
  const safeContentHeight = Math.max(1, Math.round(contentHeight));
  const scale = Math.min(
    1,
    availableContentWidth / safeContentWidth,
    availableContentHeight / safeContentHeight
  );
  const width = clamp(
    Math.round(safeContentWidth * scale) + previewWindowHorizontalPadding,
    minimumWidth,
    maximumWidth
  );
  const height = clamp(
    Math.round(safeContentHeight * scale) + previewWindowVerticalChrome,
    minimumHeight,
    maximumHeight
  );
  const anchorX = currentPreviewBounds
    ? currentPreviewBounds.x + Math.round(currentPreviewBounds.width / 2)
    : workArea.x + Math.round(workArea.width / 2);
  const anchorY = currentPreviewBounds
    ? currentPreviewBounds.y + Math.round(currentPreviewBounds.height / 2)
    : workArea.y + Math.round(workArea.height / 2);
  const maximumX = workArea.x + workArea.width - width;
  const maximumY = workArea.y + workArea.height - height;

  return {
    x: clamp(anchorX - Math.round(width / 2), workArea.x, maximumX),
    y: clamp(anchorY - Math.round(height / 2), workArea.y, maximumY),
    width,
    height
  };
};

const applyLatestPreviewContentSize = () => {
  if (
    !previewSessionActive
    || !activePreviewData
    || !latestPreviewContentSize
    || !previewWindow
    || previewWindow.isDestroyed()
    || previewWindow.isMaximized()
    || latestPreviewContentSize.sessionId !== activePreviewData.sessionId
    || latestPreviewContentSize.filePath !== activePreviewData.filePath
  ) {
    return false;
  }

  const nextBounds = getPreviewWindowBounds(
    latestPreviewContentSize.width,
    latestPreviewContentSize.height
  );
  const currentBounds = previewWindow.getBounds();
  if (
    currentBounds.x !== nextBounds.x
    || currentBounds.y !== nextBounds.y
    || currentBounds.width !== nextBounds.width
    || currentBounds.height !== nextBounds.height
  ) {
    markPreviewProgrammaticMove();
    previewWindow.setBounds(nextBounds, false);
  }
  return true;
};

const createPreviewWindow = () => {
  clearPreviewIdleDestroyTimer();
  if (previewWindow && !previewWindow.isDestroyed()) {
    return;
  }

  previewWindowLoaded = false;
  previewWindow = new BrowserWindow({
    width: previewWindowMinimumWidth,
    height: previewWindowMinimumHeight,
    minWidth: previewWindowMinimumWidth,
    minHeight: previewWindowMinimumHeight,
    title: "Cap7CE",
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    skipTaskbar: true,
    resizable: true,
    minimizable: false,
    maximizable: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  lockWebContentsZoom(previewWindow.webContents);
  previewWindow.setSkipTaskbar(true);
  previewWindow.setMenuBarVisibility(false);
  applyAlwaysOnTopState();
  previewWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  previewWindow.webContents.on("did-finish-load", () => {
    previewWindowLoaded = true;
    sendActivePreviewData();
    revealPreviewWindow();
  });
  previewWindow.on("move", () => {
    if (
      !previewSessionActive
      || !previewWindow
      || previewWindow.isDestroyed()
      || !previewWindow.isVisible()
      || previewWindow.isMaximized()
      || isPreviewProgrammaticMoveGuardActive()
    ) {
      return;
    }
    schedulePreviewMoveSnapCheck();
  });
  previewWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    closePreviewSession();
  });
  previewWindow.on("closed", () => {
    clearPreviewIdleDestroyTimer();
    clearPreviewMoveSnapCheck();
    previewWindow = null;
    previewWindowLoaded = false;
    previewSessionActive = false;
    activePreviewData = null;
    latestPreviewContentSize = null;
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    const previewUrl = new URL(devServerUrl);
    previewUrl.searchParams.set("window", "preview");
    void previewWindow.loadURL(previewUrl.toString());
  } else {
    void previewWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: { window: "preview" }
    });
  }
};

const createStartupHintWindow = async () => {
  if (startupHintWindow) return;

  const logoPathCandidates = [
    path.join(process.resourcesPath, "renderer-assets/startup/startup-logo-cap7ce.svg"),
    path.join(app.getAppPath(), "src/renderer/assets/startup/startup-logo-cap7ce.svg"),
    path.join(process.resourcesPath, "app", "src/renderer/assets/startup/startup-logo-cap7ce.svg"),
    path.join(process.resourcesPath, "app.asar", "src/renderer/assets/startup/startup-logo-cap7ce.svg")
  ];
  let logoPath: string | undefined;
  for (const candidatePath of logoPathCandidates) {
    try {
      await fs.access(candidatePath);
      logoPath = candidatePath;
      break;
    } catch {
    }
  }
  let logoSvg = "";
  if (!logoPath) {
    console.warn("[startup-hint] missing startup logo", { logoPathCandidates });
    return;
  }
  try {
    logoSvg = await fs.readFile(logoPath, "utf8");
  } catch (error) {
    console.warn("[startup-hint] missing startup logo", { logoPath, error });
    return;
  }

  const { workArea } = screen.getPrimaryDisplay();
  startupHintWindow = new BrowserWindow({
    ...workArea,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    skipTaskbar: true,
    show: false,
    focusable: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  lockWebContentsZoom(startupHintWindow.webContents);
  startupHintWindow.setSkipTaskbar(true);
  startupHintWindow.setAlwaysOnTop(true, "screen-saver");
  startupHintWindow.setIgnoreMouseEvents(true, { forward: true });
  startupHintWindow.on("closed", () => {
    if (startupHintCloseTimer !== null) {
      clearTimeout(startupHintCloseTimer);
      startupHintCloseTimer = null;
    }
    startupHintWindow = null;
  });

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: transparent;
    }

    .startup-hint-logo {
      position: fixed;
      left: 50%;
      top: 50%;
      width: 110px;
      height: 30px;
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.98);
      transform-origin: center center;
      animation:
        startup-hint-fade-in 200ms ease-out forwards,
        startup-hint-contract 650ms 760ms cubic-bezier(0.22, 0.85, 0.18, 1) forwards;
      pointer-events: none;
    }

    .startup-hint-logo svg {
      width: 110px;
      height: 30px;
      display: block;
    }

    @keyframes startup-hint-fade-in {
      to {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
    }

    @keyframes startup-hint-contract {
      0% {
        left: 50%;
        top: 50%;
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
      100% {
        left: 50%;
        top: calc(100% - 7px);
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.36, 0.14);
      }
    }
  </style>
</head>
<body>
  <div class="startup-hint-logo">${logoSvg.replace(/<\?xml[^>]*>\s*/u, "")}</div>
</body>
</html>`;

  await startupHintWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  if (!startupHintWindow || startupHintWindow.isDestroyed()) return;
  startupHintWindow.showInactive();
  startupHintCloseTimer = setTimeout(closeStartupHintWindow, 1600);
};

const getShellDisplay = () => (
  mainWindow
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay()
);

const getNormalWorkAreaBounds = (): Electron.Rectangle => {
  const { x, y, width, height } = getShellDisplay().workArea;
  return { x, y, width, height };
};

const getShellWindowBounds = (state: Cap7CEShellState): Electron.Rectangle => {
  const display = mainWindow
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const bottom = y + height;
  const centerX = x + Math.round(width / 2);

  if (state === "standby") {
    return {
      width: standbyVisualWidthPx,
      height: standbyVisualHeightPx,
      x: centerX - Math.round(standbyVisualWidthPx / 2),
      y: bottom - edgeGapPx - standbyVisualHeightPx
    };
  }

  if (state === "capsule") {
    return {
      width: capsuleWidthPx,
      height: capsuleWindowHeightPx,
      x: centerX - Math.round(capsuleWidthPx / 2),
      y: bottom - edgeGapPx - capsuleWindowHeightPx
    };
  }

  if (state === "micro") {
    return {
      width: 540,
      height: microDefaultHeightPx,
      x: centerX - 270,
      y: bottom - microDefaultHeightPx - edgeGapPx
    };
  }

  if (state === "mini") {
    return {
      width: 300,
      height: miniDefaultHeightPx,
      x: centerX - 150,
      y: bottom - miniDefaultHeightPx - edgeGapPx
    };
  }

  return {
    width: Math.min(1280, width),
    height: Math.min(760, height),
    x: x + Math.round((width - Math.min(1280, width)) / 2),
    y: y + Math.round((height - Math.min(760, height)) / 2)
  };
};

const scheduleBottomAnchoredShellWorkAreaRefresh = (changedDisplayId: number) => {
  if (
    !mainWindow
    || mainWindow.isDestroyed()
    || (activeShellState !== "standby" && activeShellState !== "capsule")
    || screen.getDisplayMatching(mainWindow.getBounds()).id !== changedDisplayId
  ) {
    return;
  }

  if (shellWorkAreaRefreshTimer !== null) {
    clearTimeout(shellWorkAreaRefreshTimer);
  }
  shellWorkAreaRefreshTimer = setTimeout(() => {
    shellWorkAreaRefreshTimer = null;
    if (
      !mainWindow
      || mainWindow.isDestroyed()
      || (activeShellState !== "standby" && activeShellState !== "capsule")
    ) {
      return;
    }

    const currentBounds = mainWindow.getBounds();
    const currentDisplay = screen.getDisplayMatching(currentBounds);
    if (currentDisplay.id !== changedDisplayId) {
      return;
    }

    const targetBounds = getShellWindowBounds(activeShellState);
    const nextBounds = activeShellState === "standby"
      ? {
          ...currentBounds,
          x: targetBounds.x,
          y: currentDisplay.workArea.y
            + currentDisplay.workArea.height
            - edgeGapPx
            - currentBounds.height
        }
      : targetBounds;
    if (
      currentBounds.x === nextBounds.x
      && currentBounds.y === nextBounds.y
      && currentBounds.width === nextBounds.width
      && currentBounds.height === nextBounds.height
    ) {
      return;
    }

    markProgrammaticMove();
    if (currentBounds.width !== nextBounds.width || currentBounds.height !== nextBounds.height) {
      markProgrammaticResize();
    }
    mainWindow.setBounds(nextBounds, false);
    logWindowBoundsDebug("[shell after workArea change]", activeShellState);
  }, 120);
};

const getMicroResizeBoundsForCurrentPosition = (currentBounds: Electron.Rectangle): Electron.Rectangle => {
  const { workArea } = screen.getDisplayMatching(currentBounds);
  const workRight = workArea.x + workArea.width;
  const workBottom = workArea.y + workArea.height;
  const nextWidth = Math.min(workArea.width, Math.max(300, Math.round(currentBounds.width)));
  const nextHeight = microDefaultHeightPx;
  const minX = workArea.x + edgeGapPx;
  const minY = workArea.y + edgeGapPx;
  const maxX = Math.max(minX, workRight - nextWidth - edgeGapPx);
  const maxY = Math.max(minY, workBottom - nextHeight - edgeGapPx);
  const currentRightGap = Math.abs(workRight - (currentBounds.x + currentBounds.width) - edgeGapPx);
  const currentBottomGap = Math.abs(workBottom - (currentBounds.y + currentBounds.height) - edgeGapPx);
  const isLeftAnchored = Math.abs(currentBounds.x - minX) <= edgeAnchorThresholdPx;
  const isRightAnchored = currentRightGap <= edgeAnchorThresholdPx;
  const isTopAnchored = Math.abs(currentBounds.y - minY) <= edgeAnchorThresholdPx;
  const isBottomAnchored = currentBottomGap <= edgeAnchorThresholdPx;
  const centerX = currentBounds.x + Math.round(currentBounds.width / 2);
  const centerY = currentBounds.y + Math.round(currentBounds.height / 2);

  return {
    width: nextWidth,
    height: nextHeight,
    x: isLeftAnchored
      ? minX
      : isRightAnchored
        ? maxX
        : clamp(centerX - Math.round(nextWidth / 2), minX, maxX),
    y: isTopAnchored
      ? minY
      : isBottomAnchored
        ? maxY
        : clamp(centerY - Math.round(nextHeight / 2), minY, maxY)
  };
};

const isBottomCenterMicroBounds = (bounds: Electron.Rectangle) => {
  const { workArea } = screen.getDisplayMatching(bounds);
  const workBottom = workArea.y + workArea.height;
  const workCenterX = workArea.x + Math.round(workArea.width / 2);
  const boundsCenterX = bounds.x + Math.round(bounds.width / 2);

  return (
    Math.abs(boundsCenterX - workCenterX) <= edgeAnchorThresholdPx &&
    Math.abs(bounds.y + bounds.height - (workBottom - edgeGapPx)) <= edgeAnchorThresholdPx
  );
};

const getBottomCenterMicroResizeBounds = (newBounds: Electron.Rectangle): Electron.Rectangle => {
  const { workArea } = screen.getDisplayMatching(newBounds);
  const microMinimumSize = getShellMinimumSize("micro");
  const minWidth = microMinimumSize?.width ?? 540;
  const maxWidth = Math.max(minWidth, workArea.width - edgeGapPx * 2);
  const nextWidth = clamp(Math.round(newBounds.width), minWidth, maxWidth);
  const nextHeight = newBounds.height < microLayoutMaxHeight
    ? Math.max(microMinimumSize?.height ?? microDefaultHeightPx, Math.round(newBounds.height))
    : microDefaultHeightPx;
  const centerX = workArea.x + Math.round(workArea.width / 2);
  const bottom = workArea.y + workArea.height;

  return {
    width: nextWidth,
    height: nextHeight,
    x: centerX - Math.round(nextWidth / 2),
    y: bottom - nextHeight - edgeGapPx
  };
};

const getShellMinimumSize = (state: Cap7CEShellState) => {
  if (state === "micro" || state === "mini" || state === "normal" || state === "settings") {
    return { width: resizableShellMinimumWidthPx, height: resizableShellMinimumHeightPx };
  }

  return null;
};

const markProgrammaticResize = () => {
  programmaticResizeGuardUntil = Date.now() + programmaticResizeGuardMs;
};

const isProgrammaticResizeGuardActive = () => Date.now() < programmaticResizeGuardUntil;

const markProgrammaticMove = () => {
  programmaticMoveGuardUntil = Date.now() + programmaticMoveGuardMs;
  if (moveSnapTimer !== null) {
    clearTimeout(moveSnapTimer);
    moveSnapTimer = null;
  }
};

const isProgrammaticMoveGuardActive = () => Date.now() < programmaticMoveGuardUntil;

const getResizeTargetState = (
  currentState: Cap7CEShellState,
  bounds: Electron.Rectangle
): Extract<Cap7CEShellState, "micro" | "mini" | "normal"> => {
  if (currentState === "micro") {
    return bounds.height >= microLayoutMaxHeight ? "mini" : "micro";
  }

  if (currentState === "mini") {
    if (bounds.width >= normalLayoutMinWidth && bounds.height >= normalLayoutMinHeight) {
      return "normal";
    }

    return bounds.height < microLayoutMaxHeight ? "micro" : "mini";
  }

  if (bounds.width >= normalLayoutMinWidth && bounds.height >= normalLayoutMinHeight) {
    return "normal";
  }

  if (bounds.height < microLayoutMaxHeight) {
    return "micro";
  }

  return "mini";
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const canSnapShellWindow = () => (
  activeShellState === "micro" ||
  activeShellState === "mini" ||
  activeShellState === "normal" ||
  activeShellState === "settings"
);

const rememberUserMovedShellBounds = (bounds: Electron.Rectangle) => {
  if (!canSnapShellWindow() || shellMaximized || mainWindow?.isMaximized()) {
    return;
  }

  userMovedShellBounds.set(activeShellState, { ...bounds });
};

const getEdgeSnappedBounds = (bounds: Electron.Rectangle): Electron.Rectangle => {
  const { workArea } = screen.getDisplayMatching(bounds);
  const workRight = workArea.x + workArea.width;
  const workBottom = workArea.y + workArea.height;
  const boundsRight = bounds.x + bounds.width;
  const boundsBottom = bounds.y + bounds.height;
  const minX = workArea.x + edgeGapPx;
  const minY = workArea.y + edgeGapPx;
  const maxX = Math.max(minX, workRight - bounds.width - edgeGapPx);
  const maxY = Math.max(minY, workBottom - bounds.height - edgeGapPx);
  let nextX = clamp(bounds.x, minX, maxX);
  let nextY = clamp(bounds.y, minY, maxY);

  if (
    Math.abs(bounds.x - workArea.x) <= edgeSnapThresholdPx ||
    Math.abs(bounds.x - minX) <= edgeSnapThresholdPx
  ) {
    nextX = minX;
  } else if (
    Math.abs(workRight - boundsRight) <= edgeSnapThresholdPx ||
    Math.abs(maxX - bounds.x) <= edgeSnapThresholdPx
  ) {
    nextX = maxX;
  }

  if (
    Math.abs(bounds.y - workArea.y) <= edgeSnapThresholdPx ||
    Math.abs(bounds.y - minY) <= edgeSnapThresholdPx
  ) {
    nextY = minY;
  } else if (
    Math.abs(workBottom - boundsBottom) <= edgeSnapThresholdPx ||
    Math.abs(maxY - bounds.y) <= edgeSnapThresholdPx
  ) {
    nextY = maxY;
  }

  return { ...bounds, x: nextX, y: nextY };
};

const clearPreviewMoveSnapCheck = () => {
  if (previewMoveSnapTimer === null) {
    return false;
  }

  clearTimeout(previewMoveSnapTimer);
  previewMoveSnapTimer = null;
  return true;
};

const markPreviewProgrammaticMove = () => {
  previewProgrammaticMoveGuardUntil = Date.now() + programmaticMoveGuardMs;
  clearPreviewMoveSnapCheck();
};

const isPreviewProgrammaticMoveGuardActive = () => Date.now() < previewProgrammaticMoveGuardUntil;

const applyPreviewEdgeSnapAfterMove = () => {
  if (
    !previewWindow
    || previewWindow.isDestroyed()
    || !previewSessionActive
    || !previewWindow.isVisible()
    || previewWindow.isMaximized()
    || !edgeSnapEnabled
  ) {
    return;
  }

  const currentBounds = previewWindow.getBounds();
  const nextBounds = getEdgeSnappedBounds(currentBounds);
  if (nextBounds.x === currentBounds.x && nextBounds.y === currentBounds.y) {
    return;
  }

  markPreviewProgrammaticMove();
  previewWindow.setBounds(nextBounds, true);
};

const schedulePreviewMoveSnapCheck = () => {
  if (
    !previewWindow
    || previewWindow.isDestroyed()
    || !previewSessionActive
    || !previewWindow.isVisible()
    || previewWindow.isMaximized()
    || !edgeSnapEnabled
  ) {
    return;
  }

  clearPreviewMoveSnapCheck();
  previewMoveSnapTimer = setTimeout(() => {
    previewMoveSnapTimer = null;
    applyPreviewEdgeSnapAfterMove();
  }, moveSnapSettleDelayMs);
};

const isDefaultBottomAnchoredBounds = (bounds: Electron.Rectangle) => {
  const { workArea } = screen.getDisplayMatching(bounds);
  const workBottom = workArea.y + workArea.height;
  const workCenterX = workArea.x + Math.round(workArea.width / 2);
  const boundsCenterX = bounds.x + Math.round(bounds.width / 2);
  const boundsBottom = bounds.y + bounds.height;

  return (
    Math.abs(boundsCenterX - workCenterX) <= edgeAnchorThresholdPx &&
    (
      Math.abs(boundsBottom - (workBottom - edgeGapPx)) <= edgeAnchorThresholdPx ||
      Math.abs(boundsBottom - workBottom) <= edgeAnchorThresholdPx
    )
  );
};

const shouldKeepDefaultBottomGapOnResize = (
  currentState: Cap7CEShellState,
  targetState: Extract<Cap7CEShellState, "micro" | "mini" | "normal">,
  currentBounds: Electron.Rectangle
) => (
  (
    (currentState === "micro" && targetState === "mini") ||
    (currentState === "mini" && targetState === "micro")
  ) &&
  isDefaultBottomAnchoredBounds(currentBounds)
);

const getResizeTransitionBounds = (
  targetState: Extract<Cap7CEShellState, "micro" | "mini" | "normal">,
  currentBounds: Electron.Rectangle,
  currentState: Cap7CEShellState
): Electron.Rectangle => {
  const { workArea } = screen.getDisplayMatching(currentBounds);

  if (shouldKeepDefaultBottomGapOnResize(currentState, targetState, currentBounds)) {
    return getShellWindowBounds(targetState);
  }

  const targetBounds = getShellWindowBounds(targetState);
  const centerX = currentBounds.x + Math.round(currentBounds.width / 2);
  const centerY = currentBounds.y + Math.round(currentBounds.height / 2);
  const maxX = Math.max(workArea.x, workArea.x + workArea.width - targetBounds.width);
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - targetBounds.height);

  return {
    ...targetBounds,
    x: clamp(centerX - Math.round(targetBounds.width / 2), workArea.x, maxX),
    y: clamp(centerY - Math.round(targetBounds.height / 2), workArea.y, maxY)
  };
};

const sendShellStateToRenderer = (state: string) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:shellStateChanged", state);
  }
};

const sendOpenSettingsToRenderer = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:openSettingsRequested");
  }
};

const sendToggleSkimToRenderer = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:toggleSkimRequested");
  }
};

const sendActivateSkimToRenderer = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:activateSkimRequested");
  }
};

const sendShowAllFilesToRenderer = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:showAllFilesRequested");
  }
};

const sendActivateCapsuleShortcutToRenderer = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:activateCapsuleShortcut");
  }
};

const sendActivateShellModeShortcutToRenderer = (mode: "micro" | "mini" | "normal" | "standby") => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:activateShellModeShortcut", mode);
  }
};

const sendStandbyLineVisibleToRenderer = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("preferences:standbyLineVisibleChanged", standbyLineVisible);
  }
};

const sendEdgeSnapEnabledToRenderer = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("preferences:edgeSnapEnabledChanged", edgeSnapEnabled);
  }
};

const showAndFocusMainWindow = () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  setShellIgnoreMouseEvents(false);
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  applyAlwaysOnTopState();
  mainWindow.focus();
  mainWindow.moveTop();
  return true;
};

const activateCapsuleShortcut = () => {
  if (!showAndFocusMainWindow()) {
    return;
  }

  if (activeShellState === "standby") {
    applyCapsuleWindowMode();
    sendShellStateToRenderer("capsule");
  }

  sendActivateCapsuleShortcutToRenderer();
};

const unregisterActivateCapsuleShortcut = () => {
  if (!registeredActivateCapsuleShortcut) {
    return;
  }

  globalShortcut.unregister(registeredActivateCapsuleShortcut);
  registeredActivateCapsuleShortcut = null;
};

const registerActivateCapsuleShortcut = (shortcut: string) => {
  unregisterActivateCapsuleShortcut();
  if (!shortcut) {
    return false;
  }

  let registered = false;
  try {
    registered = globalShortcut.register(shortcut, activateCapsuleShortcut);
  } catch (error) {
    console.warn("[shortcut] failed to register activate capsule shortcut", { shortcut, error });
    return false;
  }

  if (!registered) {
    console.warn("[shortcut] failed to register activate capsule shortcut", { shortcut });
    return false;
  }

  registeredActivateCapsuleShortcut = shortcut;
  return true;
};

const unregisterShellModeShortcuts = () => {
  for (const shortcut of registeredShellModeShortcuts.values()) {
    globalShortcut.unregister(shortcut);
  }
  registeredShellModeShortcuts.clear();
};

const activateShellModeShortcut = async (mode: "micro" | "mini" | "normal" | "standby" | "skim" | "settings") => {
  if (mode === "settings") {
    openSettingsFromTray();
    return;
  }

  if (mode !== "standby" && !showAndFocusMainWindow()) {
    return;
  }

  if (mode === "skim") {
    sendActivateSkimToRenderer();
    return;
  }

  sendActivateShellModeShortcutToRenderer(mode);
};

const registerShellModeShortcuts = (shortcutActions: {
  activateMicro: string;
  activateMini: string;
  activateNormal: string;
  activateStandby: string;
  activateSkim: string;
  openSettings: string;
}) => {
  unregisterShellModeShortcuts();
  const unavailableActionIds = new Set<GlobalShortcutActionId>();
  const shortcutModes = [
    { id: "activateMicro", shortcut: shortcutActions.activateMicro, mode: "micro" },
    { id: "activateMini", shortcut: shortcutActions.activateMini, mode: "mini" },
    { id: "activateNormal", shortcut: shortcutActions.activateNormal, mode: "normal" },
    { id: "activateStandby", shortcut: shortcutActions.activateStandby, mode: "standby" },
    { id: "activateSkim", shortcut: shortcutActions.activateSkim, mode: "skim" },
    { id: "openSettings", shortcut: shortcutActions.openSettings, mode: "settings" }
  ] as const;

  for (const { id, shortcut, mode } of shortcutModes) {
    if (!shortcut) continue;
    try {
      const registered = globalShortcut.register(shortcut, () => {
        void activateShellModeShortcut(mode);
      });
      if (registered) {
        registeredShellModeShortcuts.set(id, shortcut);
      } else {
        unavailableActionIds.add(id);
        console.warn("[shortcut] failed to register shell mode shortcut", { id, shortcut, mode });
      }
    } catch (error) {
      unavailableActionIds.add(id);
      console.warn("[shortcut] failed to register shell mode shortcut", { id, shortcut, mode, error });
    }
  }
  return unavailableActionIds;
};

const unregisterConfiguredGlobalShortcuts = () => {
  unregisterActivateCapsuleShortcut();
  unregisterShellModeShortcuts();
};

const registerConfiguredGlobalShortcuts = (shortcutActions: ShortcutActionPreferences) => {
  unregisterConfiguredGlobalShortcuts();
  const unavailableActionIds = registerShellModeShortcuts(shortcutActions);
  if (!registerActivateCapsuleShortcut(shortcutActions.activateCapsule)) {
    unavailableActionIds.add("activateCapsule");
  }
  unavailableGlobalShortcutActionIds = unavailableActionIds;
  return unavailableActionIds;
};

const probeGlobalShortcutActions = (shortcutActions: ShortcutActionPreferences) => {
  const shortcutEntries: Array<[GlobalShortcutActionId, string]> = [
    ["activateCapsule", shortcutActions.activateCapsule],
    ["activateMicro", shortcutActions.activateMicro],
    ["activateMini", shortcutActions.activateMini],
    ["activateNormal", shortcutActions.activateNormal],
    ["activateStandby", shortcutActions.activateStandby],
    ["activateSkim", shortcutActions.activateSkim],
    ["openSettings", shortcutActions.openSettings]
  ];
  const unavailableActionIds = new Set<GlobalShortcutActionId>();
  const registeredShortcuts: string[] = [];

  for (const [id, shortcut] of shortcutEntries) {
    if (!shortcut) {
      unavailableActionIds.add(id);
      continue;
    }
    try {
      if (globalShortcut.register(shortcut, () => undefined)) {
        registeredShortcuts.push(shortcut);
      } else {
        unavailableActionIds.add(id);
      }
    } catch (error) {
      unavailableActionIds.add(id);
      console.warn("[shortcut] failed to probe shortcut", { id, shortcut, error });
    }
  }

  for (const shortcut of registeredShortcuts) {
    globalShortcut.unregister(shortcut);
  }
  unavailableGlobalShortcutActionIds = unavailableActionIds;
  return unavailableActionIds;
};

const shortcutAvailabilityResponse = () => ({
  unavailableActionIds: Array.from(unavailableGlobalShortcutActionIds)
});

const updateTrayMenu = () => {
  if (!appTray) return;

  appTray.setContextMenu(Menu.buildFromTemplate([
    {
      label: standbyLineVisible ? t("tray.hideLine") : t("tray.showLine"),
      click: () => {
        void setStandbyLineVisible(!standbyLineVisible);
      }
    },
    {
      label: edgeSnapEnabled ? t("tray.disableEdgeSnap") : t("tray.enableEdgeSnap"),
      click: () => {
        void setEdgeSnapEnabled(!edgeSnapEnabled);
      }
    },
    {
      label: t("tray.openSettings"),
      click: openSettingsFromTray
    },
    {
      label: t("tray.quit"),
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
};

const isMainWindowInBackground = () => (
  Boolean(mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused())
);

const showSystemNotification = (title: string, content: string) => {
  if (!systemNotificationsEnabled || process.platform !== "win32" || !appTray) {
    return false;
  }
  try {
    appTray.displayBalloon({
      iconType: "custom",
      icon: path.join(app.getAppPath(), "build", "icon.ico"),
      title,
      content,
      noSound: true,
      respectQuietTime: true
    });
    return true;
  } catch (error) {
    console.warn("[system-notification] failed", error);
    return false;
  }
};

const showBackgroundRunNotificationOnce = async (
  preferences: Awaited<ReturnType<typeof getUserPreferences>>
) => {
  if (!preferences.systemNotificationsEnabled || preferences.backgroundRunNotificationShown) return;
  const configuredShortcut = preferences.shortcutActions.activateCapsule;
  const shortcutAvailable = preferences.quickActionGlobalEnabled
    && !unavailableGlobalShortcutActionIds.has("activateCapsule");
  const content = shortcutAvailable
    ? t("notification.backgroundRunContent", { shortcut: configuredShortcut })
    : t("notification.backgroundRunContentWithoutShortcut");
  if (showSystemNotification(t("notification.backgroundRunTitle"), content)) {
    await markBackgroundRunNotificationShown();
  }
};

const handleThumbnailOptimizationStatusForNotification = (status: ThumbnailOptimizationStatus) => {
  if (status.phase === "running" && cacheNotificationBatchBaseline === null) {
    cacheNotificationBatchBaseline = {
      processedCount: status.processedCount,
      failedCount: status.failedCount,
      activeDurationMs: status.activeDurationMs
    };
    return;
  }
  if (status.phase === "disabled") {
    cacheNotificationBatchBaseline = null;
    return;
  }
  if (status.phase !== "completed" || cacheNotificationBatchBaseline === null) return;

  const baseline = cacheNotificationBatchBaseline;
  cacheNotificationBatchBaseline = null;
  const processedCount = status.processedCount - baseline.processedCount;
  const failedCount = status.failedCount - baseline.failedCount;
  const activeDurationMs = status.activeDurationMs - baseline.activeDurationMs;
  const now = Date.now();
  if (
    processedCount <= 0
    || activeDurationMs < backgroundTaskNotificationMinimumMs
    || !isMainWindowInBackground()
    || now - lastCacheCompletionNotificationAt < cacheCompletionNotificationCooldownMs
  ) {
    return;
  }

  const content = failedCount > 0
    ? t("notification.cacheCompletedWithFailures", { count: processedCount, failed: failedCount })
    : t("notification.cacheCompleted", { count: processedCount });
  if (showSystemNotification(t("notification.cacheCompletedTitle"), content)) {
    lastCacheCompletionNotificationAt = now;
  }
};

const createAppTray = () => {
  if (appTray) return;

  appTray = new Tray(path.join(app.getAppPath(), "build", "icon.ico"));
  appTray.setToolTip("Cap7CE");
  appTray.on("double-click", () => openNormalFromTray());
  appTray.on("balloon-click", () => openSettingsFromTray());
  updateTrayMenu();
};

const setStandbyLineVisible = async (nextStandbyLineVisible: boolean) => {
  standbyLineVisible = nextStandbyLineVisible;
  const preferences = await updateStandbyLineVisiblePreference(nextStandbyLineVisible);
  standbyLineVisible = preferences.standbyLineVisible;
  updateTrayMenu();
  sendStandbyLineVisibleToRenderer();

  if (activeShellState === "standby") {
    applyStandbyWindowMode();
  }

  return preferences;
};

const setEdgeSnapEnabled = async (nextEdgeSnapEnabled: boolean) => {
  const preferences = await updateEdgeSnapPreference(nextEdgeSnapEnabled);
  edgeSnapEnabled = preferences.edgeSnapEnabled;
  updateTrayMenu();
  sendEdgeSnapEnabledToRenderer();
  return preferences;
};

const openSettingsFromTray = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (!showAndFocusMainWindow()) {
    return;
  }
  const preserveBounds = activeShellState === "normal" || activeShellState === "settings";
  if (activeShellState !== "settings") {
    applyShellWindowState("settings", { preserveBounds });
  }
  showAndFocusMainWindow();
  sendShellStateToRenderer("settings");
  sendOpenSettingsToRenderer();
};

const openNormalFromTray = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (!showAndFocusMainWindow()) {
    return;
  }
  const preserveBounds = activeShellState === "normal" || activeShellState === "settings";
  if (activeShellState !== "normal") {
    applyShellWindowState("normal", { preserveBounds });
  }
  if (!showAndFocusMainWindow()) {
    return;
  }
  sendShellStateToRenderer("normal");
  sendShowAllFilesToRenderer();
};

const getBoundsDebugPayload = (shellState: Extract<Cap7CEShellState, "standby" | "capsule">) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }

  const bounds = mainWindow.getBounds();
  const contentBounds = mainWindow.getContentBounds();
  const { workArea } = screen.getDisplayMatching(bounds);
  const boundsBottom = bounds.y + bounds.height;
  const workAreaBottom = workArea.y + workArea.height;

  return {
    shellState,
    bounds,
    contentBounds,
    workArea,
    boundsBottom,
    workAreaBottom,
    exceedsWorkAreaBottom: boundsBottom > workAreaBottom,
    isFocused: mainWindow.isFocused(),
    isAlwaysOnTop: mainWindow.isAlwaysOnTop(),
    isResizable: mainWindow.isResizable(),
    isMovable: mainWindow.isMovable(),
    isVisible: mainWindow.isVisible(),
    ignoreMouseEventsDebug: {
      currentIgnoreMouseEvents: shellIgnoreMouseEvents,
      currentEntryPath: shellState === "standby"
        ? "applyStandbyWindowMode"
        : "applyCapsuleWindowMode",
      expectedRules: shellState === "standby"
        ? "false only when cursor is inside standby bounds; true with forward elsewhere"
        : "false only when cursor is inside the current capsule window bounds; true with forward elsewhere",
      switchPoints: [
        "setShellIgnoreMouseEvents",
        "syncShellMousePassthrough",
        "startShellMousePassthrough",
        "stopShellMousePassthrough"
      ]
    }
  };
};

const logWindowBoundsDebug = (
  label: string,
  shellState: Extract<Cap7CEShellState, "standby" | "capsule">
) => {
  if (!DEBUG_WINDOW_BOUNDS || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  console.log(`[window] ${label}`, getBoundsDebugPayload(shellState));
};

const isPointInsideBounds = (point: Electron.Point, bounds: Electron.Rectangle) => (
  point.x >= bounds.x &&
  point.x < bounds.x + bounds.width &&
  point.y >= bounds.y &&
  point.y < bounds.y + bounds.height
);

const setShellIgnoreMouseEvents = (ignore: boolean) => {
  if (!mainWindow || mainWindow.isDestroyed() || shellIgnoreMouseEvents === ignore) {
    return;
  }

  shellIgnoreMouseEvents = ignore;
  if (ignore) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow.setIgnoreMouseEvents(false);
  }

  if (DEBUG_WINDOW_BOUNDS) {
    console.log("[window] setIgnoreMouseEvents", {
      shellState: activeShellState,
      ignore,
      forward: ignore,
      path: activeShellState === "standby" || activeShellState === "capsule"
        ? "adaptive global cursor polling"
        : "normal window mode"
    });
  }
};

const syncShellMousePassthrough = () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }

  if (activeShellState !== "standby" && activeShellState !== "capsule") {
    setShellIgnoreMouseEvents(false);
    return null;
  }

  const cursorPoint = screen.getCursorScreenPoint();
  const windowBounds = mainWindow.getBounds();
  const interactiveBounds = activeShellState === "standby"
    ? getBottomAnchoredInteractiveBounds(windowBounds, standbyInteractionHeightPx)
    : windowBounds;
  stationaryShellMousePollCount = lastShellMousePoint
    && lastShellMousePoint.x === cursorPoint.x
    && lastShellMousePoint.y === cursorPoint.y
    ? stationaryShellMousePollCount + 1
    : 0;
  lastShellMousePoint = cursorPoint;
  setShellIgnoreMouseEvents(!isPointInsideBounds(cursorPoint, interactiveBounds));
  return getShellMousePollDelay(cursorPoint, interactiveBounds, stationaryShellMousePollCount);
};

const scheduleShellMousePassthrough = (delayMs: number) => {
  shellMousePassthroughTimer = setTimeout(() => {
    shellMousePassthroughTimer = null;
    const nextDelayMs = syncShellMousePassthrough();
    if (nextDelayMs !== null) {
      scheduleShellMousePassthrough(nextDelayMs);
    }
  }, delayMs);
};

const startShellMousePassthrough = () => {
  if (shellMousePassthroughTimer !== null) {
    return;
  }
  lastShellMousePoint = null;
  stationaryShellMousePollCount = 0;
  const nextDelayMs = syncShellMousePassthrough();
  if (nextDelayMs !== null) {
    scheduleShellMousePassthrough(nextDelayMs);
  }
};

const stopShellMousePassthrough = () => {
  if (shellMousePassthroughTimer !== null) {
    clearTimeout(shellMousePassthroughTimer);
    shellMousePassthroughTimer = null;
  }
  lastShellMousePoint = null;
  stationaryShellMousePollCount = 0;
  setShellIgnoreMouseEvents(false);
};

const applyAlwaysOnTopState = () => {
  const previewIsActive = Boolean(
    previewSessionActive
    && previewWindow
    && !previewWindow.isDestroyed()
    && previewWindow.isVisible()
  );

  if (mainWindow && !mainWindow.isDestroyed() && !previewIsActive) {
    if (shellAlwaysOnTop) {
      mainWindow.setAlwaysOnTop(true, "screen-saver");
      if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
        mainWindow.moveTop();
        mainWindow.focus();
      }
    } else {
      mainWindow.setAlwaysOnTop(false);
    }
  }

  if (previewIsActive && previewWindow && !previewWindow.isDestroyed()) {
    if (shellAlwaysOnTop) {
      previewWindow.setAlwaysOnTop(true, "screen-saver");
      previewWindow.moveTop();
    } else {
      previewWindow.setAlwaysOnTop(false);
    }
  }

  return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isAlwaysOnTop());
};

const sendAlwaysOnTopStateToRenderer = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:alwaysOnTopChanged", shellAlwaysOnTop);
  }
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.webContents.send("window:alwaysOnTopChanged", shellAlwaysOnTop);
  }
};

const getAlwaysOnTopState = (enabled = shellAlwaysOnTop) => ({
  enabled,
  actual: mainWindow && !mainWindow.isDestroyed() ? mainWindow.isAlwaysOnTop() : false,
  windowId: mainWindow && !mainWindow.isDestroyed() ? mainWindow.id : null
});

const resetShellBehavior = () => {
  shellMaximized = false;
  lastNormalBounds = null;
  microBottomCenterAnchored = false;
  if (moveSnapTimer !== null) {
    clearTimeout(moveSnapTimer);
    moveSnapTimer = null;
  }
  if (resizeSettledTimer !== null) {
    clearTimeout(resizeSettledTimer);
    resizeSettledTimer = null;
  }
};

const applyStandbyWindowMode = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  resetShellBehavior();
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  }

  const standbyBounds = getShellWindowBounds("standby");
  markProgrammaticResize();
  markProgrammaticMove();
  mainWindow.setMinimumSize(1, 1);
  mainWindow.setHasShadow(false);
  mainWindow.setResizable(false);
  mainWindow.setShape([]);
  setShellIgnoreMouseEvents(false);
  mainWindow.setBounds(standbyBounds, true);
  const actualStandbyBounds = mainWindow.getBounds();
  if (actualStandbyBounds.height !== standbyBounds.height) {
    const { workArea } = screen.getDisplayMatching(actualStandbyBounds);
    markProgrammaticMove();
    mainWindow.setBounds({
      ...actualStandbyBounds,
      x: standbyBounds.x,
      y: workArea.y + workArea.height - edgeGapPx - actualStandbyBounds.height
    }, false);
  }
  const shapedStandbyBounds = mainWindow.getBounds();
  const standbyShapeHeight = Math.min(standbyInteractionHeightPx, shapedStandbyBounds.height);
  mainWindow.setShape([{
    x: 0,
    y: shapedStandbyBounds.height - standbyShapeHeight,
    width: shapedStandbyBounds.width,
    height: standbyShapeHeight
  }]);
  applyAlwaysOnTopState();
  activeShellState = "standby";
  syncTaskbarVisibility(activeShellState);
  updateTrayMenu();

  if (!standbyLineVisible) {
    stopShellMousePassthrough();
    mainWindow.hide();
    return true;
  }

  if (!mainWindow.isVisible()) {
    mainWindow.showInactive();
    applyAlwaysOnTopState();
  }
  mainWindow.blur();
  startShellMousePassthrough();

  logWindowBoundsDebug("[standby after setBounds]", "standby");

  return true;
};

const applyCapsuleWindowMode = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  resetShellBehavior();
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  }

  logWindowBoundsDebug("[capsule before]", "capsule");
  const capsuleBounds = getShellWindowBounds("capsule");
  markProgrammaticResize();
  markProgrammaticMove();
  mainWindow.setMinimumSize(1, 1);
  mainWindow.setHasShadow(false);
  mainWindow.setResizable(false);
  mainWindow.setShape([]);
  setShellIgnoreMouseEvents(false);
  mainWindow.setBounds(capsuleBounds, false);
  mainWindow.setContentSize(capsuleBounds.width, capsuleBounds.height, false);
  applyAlwaysOnTopState();
  mainWindow.moveTop();
  activeShellState = "capsule";
  syncTaskbarVisibility(activeShellState);
  startShellMousePassthrough();

  logWindowBoundsDebug("[capsule after setBounds]", "capsule");
  setTimeout(() => {
    logWindowBoundsDebug("[capsule after 100ms]", "capsule");
  }, 100);

  return true;
};

const applyShellWindowState = (state: string, options: { preserveBounds?: boolean } = {}) => {
  if (!mainWindow || !isShellWindowState(state)) return false;
  if (state === "standby") {
    return applyStandbyWindowMode();
  }
  if (state === "capsule") {
    return applyCapsuleWindowMode();
  }
  microBottomCenterAnchored = false;
  mainWindow.setShape([]);

  const isLargeWindow = state === "normal" || state === "settings";
  const isResizableWindow = state === "micro" || state === "mini" || isLargeWindow;
  const minimumSize = getShellMinimumSize(state);
  const preserveBounds = Boolean(options.preserveBounds);
  if (preserveBounds && canSnapShellWindow()) {
    rememberUserMovedShellBounds(mainWindow.getBounds());
  }
  if (!isLargeWindow) {
    shellMaximized = false;
  }
  if (mainWindow.isMaximized() && !preserveBounds) {
    mainWindow.unmaximize();
  }
  mainWindow.setResizable(isResizableWindow);
  if (minimumSize) {
    mainWindow.setMinimumSize(minimumSize.width, minimumSize.height);
  } else {
    mainWindow.setMinimumSize(1, 1);
  }
  mainWindow.setHasShadow(!(isLargeWindow && (shellMaximized || mainWindow.isMaximized())));
  if (!preserveBounds) {
    markProgrammaticResize();
    markProgrammaticMove();
    mainWindow.setBounds(shellMaximized && isLargeWindow ? getNormalWorkAreaBounds() : getShellWindowBounds(state), true);
  }
  stopShellMousePassthrough();
  applyAlwaysOnTopState();
  if (!preserveBounds) {
    mainWindow.moveTop();
  }
  activeShellState = state;
  microBottomCenterAnchored = (
    state === "micro" &&
    !preserveBounds &&
    isBottomCenterMicroBounds(mainWindow.getBounds())
  );
  syncTaskbarVisibility(activeShellState);
  if (preserveBounds && canSnapShellWindow()) {
    rememberUserMovedShellBounds(mainWindow.getBounds());
  }
  return true;
};

const setShellWindowStateFromResize = (state: Cap7CEShellState) => {
  if (state === activeShellState) return false;
  if (!mainWindow || !isShellWindowState(state)) return false;

  const targetState = state as Extract<Cap7CEShellState, "micro" | "mini" | "normal">;
  const minimumSize = getShellMinimumSize(targetState);
  const currentBounds = mainWindow.getBounds();
  const keepDefaultBottomGap = shouldKeepDefaultBottomGapOnResize(activeShellState, targetState, currentBounds);
  const transitionBounds = getResizeTransitionBounds(targetState, currentBounds, activeShellState);
  const nextBounds = keepDefaultBottomGap || !edgeSnapEnabled ? transitionBounds : getEdgeSnappedBounds(transitionBounds);
  const isResizableWindow = targetState === "micro" || targetState === "mini" || targetState === "normal";

  mainWindow.setShape([]);

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  }
  if (minimumSize) {
    mainWindow.setMinimumSize(minimumSize.width, minimumSize.height);
  }
  mainWindow.setHasShadow(true);
  mainWindow.setResizable(isResizableWindow);
  stopShellMousePassthrough();
  shellMaximized = false;
  microBottomCenterAnchored = false;
  markProgrammaticResize();
  markProgrammaticMove();
  mainWindow.setBounds(nextBounds, true);
  mainWindow.moveTop();
  activeShellState = targetState;
  microBottomCenterAnchored = (
    targetState === "micro" &&
    isBottomCenterMicroBounds(nextBounds)
  );
  syncTaskbarVisibility(activeShellState);
  rememberUserMovedShellBounds(nextBounds);
  applyAlwaysOnTopState();
  sendShellStateToRenderer(state);
  return true;
};

registerLlamaRuntimeShutdownHandler();

onLlamaRuntimeProcessStateChanged((state) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("llamaRuntime:statusChanged", state);
  }
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: "cap7ce",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

const registerLocalImageProtocol = () => {
  const toResponseBody = (buffer: Buffer) => (
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  );

  protocol.handle("cap7ce", async (request) => {
    const url = new URL(request.url);
    if (
      url.hostname !== "thumbnail"
      && url.hostname !== "image"
      && url.hostname !== "skim-image"
      && url.hostname !== "skim-thumbnail"
      && url.hostname !== "skim-preview"
      && url.hostname !== "skim-media"
    ) {
      return new Response("Not found", { status: 404 });
    }

    const filePath = url.searchParams.get("path");
    if (!filePath) {
      return new Response("Missing path", { status: 400 });
    }

    try {
      if (url.hostname === "skim-media") {
        const extension = path.extname(filePath).toLowerCase();
        const expectedProvider = skimAudioPreviewExtensions.has(extension)
          ? "audio"
          : skimVideoPreviewExtensions.has(extension)
            ? "video"
            : null;
        const normalizedRequestedPath = path.normalize(path.resolve(filePath));
        const normalizedActivePath = activePreviewData
          ? path.normalize(path.resolve(activePreviewData.filePath))
          : "";
        const samePath = process.platform === "win32"
          ? normalizedRequestedPath.toLowerCase() === normalizedActivePath.toLowerCase()
          : normalizedRequestedPath === normalizedActivePath;
        if (!expectedProvider || !samePath || activePreviewData?.provider !== expectedProvider) {
          return new Response("Media preview is unavailable", { status: 403 });
        }

        const stat = await fs.stat(normalizedRequestedPath);
        if (!stat.isFile()) return new Response("Media preview is unavailable", { status: 404 });
        const mimeType = getSkimMediaMimeType(extension);
        if (!mimeType) return new Response("Media preview is unavailable", { status: 415 });
        const rangeHeader = request.headers.get("range");
        const byteRange = parseSkimMediaByteRange(stat.size, rangeHeader);
        if (!byteRange) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
        const { start, end, status } = byteRange;
        const headers: Record<string, string> = {
          "Accept-Ranges": "bytes",
          "Content-Length": String(stat.size === 0 ? 0 : end - start + 1),
          "Content-Type": mimeType,
          "Cache-Control": "no-store"
        };
        if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
        const body = request.method === "HEAD" || stat.size === 0
          ? null
          : Readable.toWeb(createReadStream(normalizedRequestedPath, { start, end })) as ReadableStream<Uint8Array>;
        return new Response(body, { status, headers });
      }
      if (url.hostname === "skim-thumbnail" || url.hostname === "skim-preview") {
        const sessionId = url.searchParams.get("session");
        const capability = getFileFormatCapability(path.extname(filePath).toLowerCase());
        if (!sessionId || (url.hostname === "skim-preview" && !capability?.canThumbnail)) {
          return new Response("Skim visual request is unavailable", { status: 415 });
        }
        const cachePath = url.hostname === "skim-thumbnail" && !capability?.canThumbnail
          ? await requestSkimShellThumbnailCache(sessionId, filePath)
          : await requestSkimVisualCache(
            sessionId,
            filePath,
            url.hostname === "skim-preview" ? "preview" : "thumbnail"
          );
        const image = await readVisualCacheImage(cachePath);
        return new Response(toResponseBody(image.buffer), {
          headers: {
            "Content-Type": image.mimeType,
            "Cache-Control": "no-store"
          }
        });
      }
      if (url.hostname === "skim-image") {
        if (!getFileFormatCapability(path.extname(filePath).toLowerCase())?.canDirectPreview) {
          return new Response("Skim source preview is unavailable", { status: 415 });
        }
        return net.fetch(pathToFileURL(filePath).toString());
      }
      if (url.hostname === "image") {
        if (await shouldUseSourceFileForPreview(filePath)) {
          return net.fetch(pathToFileURL(filePath).toString());
        }

        try {
          const previewPath = await ensurePreviewImagePath(filePath);
          const preview = await readVisualCacheImage(previewPath);
          return new Response(toResponseBody(preview.buffer), {
            headers: {
              "Content-Type": preview.mimeType,
              "Cache-Control": "no-store"
            }
          });
        } catch (error) {
          if (previewSourceFallbackExtensions.has(path.extname(filePath).toLowerCase())) {
            return net.fetch(pathToFileURL(filePath).toString());
          }
          throw error;
        }
      }

      const thumbnailPath = await ensureThumbnailPath(filePath);
      const thumbnail = await readVisualCacheImage(thumbnailPath);
      return new Response(toResponseBody(thumbnail.buffer), {
        headers: {
          "Content-Type": thumbnail.mimeType,
          "Cache-Control": "no-store"
        }
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const status = code === "ENOENT" ? 404 : code === "ECANCELED" ? 499 : 500;
      const message = error instanceof Error ? error.message : "Thumbnail unavailable";
      console.warn("[thumbnail] failed", { filePath, status, message });
      return new Response(message, { status });
    }
  });
};

const evaluateShellResizeThresholds = () => {
  if (!mainWindow || mainWindow.isDestroyed() || isProgrammaticResizeGuardActive()) {
    return;
  }

  if (activeShellState !== "micro" && activeShellState !== "mini" && activeShellState !== "normal" && activeShellState !== "settings") {
    return;
  }

  const currentBounds = mainWindow.getBounds();
  const nextState = getResizeTargetState(activeShellState, currentBounds);
  if (activeShellState === "settings") {
    if (nextState !== "normal") {
      shellMaximized = false;
      setShellWindowStateFromResize(nextState);
    }
    return;
  }

  if (activeShellState === "normal" && nextState !== "normal") {
    shellMaximized = false;
  }
  if (nextState === activeShellState && activeShellState === "micro") {
    const nextBounds = getMicroResizeBoundsForCurrentPosition(currentBounds);
    if (
      nextBounds.x !== currentBounds.x ||
      nextBounds.y !== currentBounds.y ||
      nextBounds.width !== currentBounds.width ||
      nextBounds.height !== currentBounds.height
    ) {
      markProgrammaticResize();
      markProgrammaticMove();
      mainWindow.setBounds(nextBounds, true);
      mainWindow.webContents.invalidate();
    }
    return;
  }
  setShellWindowStateFromResize(nextState);
};

const scheduleResizeSettledCheck = () => {
  if (resizeSettledTimer !== null) {
    clearTimeout(resizeSettledTimer);
  }

  resizeSettledTimer = setTimeout(() => {
    resizeSettledTimer = null;
    evaluateShellResizeThresholds();
  }, resizeSettleDelayMs);
};

const applyEdgeSnapAfterMove = () => {
  if (!mainWindow || mainWindow.isDestroyed() || !edgeSnapEnabled || shellMaximized || mainWindow.isMaximized() || !canSnapShellWindow()) {
    return;
  }

  const currentBounds = mainWindow.getBounds();
  const nextBounds = getEdgeSnappedBounds(currentBounds);
  if (nextBounds.x === currentBounds.x && nextBounds.y === currentBounds.y) {
    rememberUserMovedShellBounds(currentBounds);
    return;
  }

  markProgrammaticMove();
  mainWindow.setBounds(nextBounds, true);
  rememberUserMovedShellBounds(nextBounds);
};

const scheduleMoveSnapCheck = () => {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    shellMaximized ||
    mainWindow.isMaximized() ||
    !edgeSnapEnabled ||
    resizeSettledTimer !== null ||
    !canSnapShellWindow()
  ) {
    return;
  }

  if (moveSnapTimer !== null) {
    clearTimeout(moveSnapTimer);
  }

  moveSnapTimer = setTimeout(() => {
    moveSnapTimer = null;
    applyEdgeSnapAfterMove();
  }, moveSnapSettleDelayMs);
};

const clearResizeSettledCheck = () => {
  if (resizeSettledTimer === null) {
    return false;
  }

  clearTimeout(resizeSettledTimer);
  resizeSettledTimer = null;
  return true;
};

const applyBottomCenterMicroWillResize = (
  event: Electron.Event,
  newBounds: Electron.Rectangle
) => {
  if (!mainWindow || mainWindow.isDestroyed() || activeShellState !== "micro" || !microBottomCenterAnchored) {
    return;
  }

  const currentBounds = mainWindow.getBounds();
  if (!isBottomCenterMicroBounds(currentBounds)) {
    microBottomCenterAnchored = false;
    return;
  }

  const widthDelta = Math.abs(newBounds.width - currentBounds.width);
  const heightDelta = Math.abs(newBounds.height - currentBounds.height);
  const isHorizontalResize = widthDelta > 0 && heightDelta <= Math.max(2, Math.round(widthDelta * 0.2));
  if (!isHorizontalResize || newBounds.height >= microLayoutMaxHeight) {
    return;
  }

  event.preventDefault();
  const nextBounds = getBottomCenterMicroResizeBounds(newBounds);
  markProgrammaticResize();
  markProgrammaticMove();
  mainWindow.setBounds(nextBounds, true);
  mainWindow.webContents.invalidate();
};

const forceApplyDefaultMicroBounds = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  const defaultMicroBounds = getShellWindowBounds("micro");
  clearResizeSettledCheck();
  const minimumSize = getShellMinimumSize("micro");

  shellMaximized = false;
  lastNormalBounds = null;
  mainWindow.setShape([]);
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  }
  mainWindow.setResizable(true);
  if (minimumSize) {
    mainWindow.setMinimumSize(minimumSize.width, minimumSize.height);
  }
  mainWindow.setHasShadow(true);
  stopShellMousePassthrough();
  markProgrammaticResize();
  markProgrammaticMove();
  mainWindow.setBounds(defaultMicroBounds, true);
  mainWindow.moveTop();
  activeShellState = "micro";
  syncTaskbarVisibility(activeShellState);
  microBottomCenterAnchored = true;
  applyAlwaysOnTopState();

  return true;
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: standbyVisualWidthPx,
    height: standbyVisualHeightPx,
    minWidth: 1,
    minHeight: 1,
    title: "Cap7CE",
    skipTaskbar: true,
    frame: false,
    transparent: true,
    hasShadow: false,
    show: false,
    backgroundColor: "#00000000",
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  lockWebContentsZoom(mainWindow.webContents);
  mainWindowSkipTaskbar = true;

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    applyStandbyWindowMode();
    if (standbyLineVisible) {
      mainWindow?.show();
      applyAlwaysOnTopState();
    }
    syncThumbnailOptimizationActivity();
  });

  mainWindow.on("focus", syncThumbnailOptimizationActivity);
  mainWindow.on("blur", () => {
    syncThumbnailOptimizationActivity();
    cancelActiveSearchTasks();
  });
  mainWindow.on("show", syncThumbnailOptimizationActivity);
  mainWindow.on("hide", () => {
    syncThumbnailOptimizationActivity();
    cancelActiveSearchTasks();
  });

  mainWindow.on("will-resize", applyBottomCenterMicroWillResize);

  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on("resize", () => {
    if (resizeRepaintTimer !== null) {
      if (!isProgrammaticResizeGuardActive()) {
        scheduleResizeSettledCheck();
      }
      return;
    }

    resizeRepaintTimer = setTimeout(() => {
      mainWindow?.webContents.invalidate();
      resizeRepaintTimer = null;
    }, 16);

    if (!isProgrammaticResizeGuardActive()) {
      if (shellMaximized && (activeShellState === "normal" || activeShellState === "settings")) {
        shellMaximized = false;
      }
      scheduleResizeSettledCheck();
    }
  });

  mainWindow.on("move", () => {
    if (isProgrammaticMoveGuardActive()) {
      return;
    }

    if (activeShellState === "micro") {
      microBottomCenterAnchored = false;
    }
    if (!edgeSnapEnabled) {
      const movedBounds = mainWindow?.getBounds();
      if (movedBounds) {
        rememberUserMovedShellBounds(movedBounds);
      }
      return;
    }
    scheduleMoveSnapCheck();
  });
};

app.whenReady().then(async () => {
  registerLocalImageProtocol();
  await ensureImageDatabase();
  try {
    await backfillFilePathEvidence(await listDirectories());
  } catch (error) {
    console.warn("[search-path-evidence] failed to backfill existing catalog paths", error);
  }
  const preferences = await getUserPreferences();
  setActiveLanguage(resolveLanguagePreference(preferences.languagePreference, app.getLocale()));
  edgeSnapEnabled = preferences.edgeSnapEnabled;
  shellAlwaysOnTop = preferences.alwaysOnTop;
  standbyLineVisible = preferences.standbyLineVisible;
  systemNotificationsEnabled = preferences.systemNotificationsEnabled;
  quickActionGlobalEnabled = preferences.quickActionGlobalEnabled;
  applyLaunchAtLoginPreference(preferences.launchAtLogin);
  setThumbnailOptimizationSort(preferences.sortPreference.sortField, preferences.sortPreference.sortDirection);
  await pauseThumbnailOptimization("inactive-content");
  await setThumbnailOptimizationEnabled(preferences.autoCacheOptimizationEnabled);
  createWindow();
  screen.on("display-metrics-changed", (_event, display, changedMetrics) => {
    if (!changedMetrics.includes("workArea") && !changedMetrics.includes("bounds")) {
      return;
    }
    scheduleBottomAnchoredShellWorkAreaRefresh(display.id);
  });
  setThumbnailOptimizationStatusListener((status) => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send("cache:optimizationStatusChanged", status);
    }
    handleThumbnailOptimizationStatusForNotification(status);
  });
  void createStartupHintWindow();
  createAppTray();
  if (quickActionGlobalEnabled) {
    registerConfiguredGlobalShortcuts(preferences.shortcutActions);
  } else {
    probeGlobalShortcutActions(preferences.shortcutActions);
  }
  void showBackgroundRunNotificationOnce(preferences).catch((error) => {
    console.warn("[system-notification] failed to persist first-run state", error);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (isQuitting && process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  if (shellWorkAreaRefreshTimer !== null) {
    clearTimeout(shellWorkAreaRefreshTimer);
    shellWorkAreaRefreshTimer = null;
  }
  closeStartupHintWindow();
  clearPreviewIdleDestroyTimer();
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.destroy();
  }
  previewWindow = null;
  unregisterActivateCapsuleShortcut();
  unregisterShellModeShortcuts();
  appTray?.destroy();
  appTray = null;
});

ipcMain.handle("window:getShellLayoutMetrics", () => ({
  miniStandardHeight: miniDefaultHeightPx
}));

ipcMain.handle("window:setShellState", (_event, state: string, options?: { forceBounds?: boolean; preserveBounds?: boolean }) => {
  const forceBounds = Boolean(options?.forceBounds);
  if (state === "micro" && forceBounds) {
    return forceApplyDefaultMicroBounds();
  }

  if (state === "standby") {
    return applyStandbyWindowMode();
  }
  if (state === "capsule") {
    return applyCapsuleWindowMode();
  }

  if (isShellWindowState(state) && state === activeShellState && !forceBounds) {
    return true;
  }

  return applyShellWindowState(state, { preserveBounds: Boolean(options?.preserveBounds) });
});

ipcMain.handle("window:setAlwaysOnTop", async (_event, enabled: boolean) => {
  if (!mainWindow) return { enabled: Boolean(enabled), actual: false, windowId: null };
  const requestedEnabled = Boolean(enabled);
  const before = mainWindow.isAlwaysOnTop();
  const preferences = await updateAlwaysOnTopPreference(requestedEnabled);
  shellAlwaysOnTop = preferences.alwaysOnTop;
  const after = applyAlwaysOnTopState();
  sendAlwaysOnTopStateToRenderer();
  console.log("[alwaysOnTop]", {
    enabled: requestedEnabled,
    before,
    after,
    windowId: mainWindow.id,
    visible: mainWindow.isVisible(),
    focused: mainWindow.isFocused(),
    minimized: mainWindow.isMinimized(),
    destroyed: mainWindow.isDestroyed()
  });
  return getAlwaysOnTopState(requestedEnabled);
});

ipcMain.handle("window:getAlwaysOnTop", () => {
  applyAlwaysOnTopState();
  return getAlwaysOnTopState();
});

ipcMain.handle("window:toggleNormalMaximized", () => {
  if (!mainWindow || (activeShellState !== "normal" && activeShellState !== "settings")) {
    return { isMaximized: shellMaximized, lastNormalBounds };
  }

  if (shellMaximized) {
    const restoreBounds = lastNormalBounds ?? getShellWindowBounds(activeShellState);
    markProgrammaticResize();
    markProgrammaticMove();
    mainWindow.setBounds(restoreBounds, true);
    shellMaximized = false;
    mainWindow.setHasShadow(true);
    return { isMaximized: shellMaximized, lastNormalBounds };
  }

  lastNormalBounds = mainWindow.getBounds();
  markProgrammaticResize();
  markProgrammaticMove();
  mainWindow.setHasShadow(false);
  mainWindow.setBounds(getNormalWorkAreaBounds(), true);
  shellMaximized = true;
  return { isMaximized: shellMaximized, lastNormalBounds };
});

ipcMain.handle("app:quit", () => {
  isQuitting = true;
  app.quit();
  return true;
});

ipcMain.handle("app:openReleasePage", async () => {
  await shell.openExternal(releasePageUrl);
  return true;
});

ipcMain.handle("app:checkForUpdates", async (event) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return {
      status: "failed",
      currentVersion: app.getVersion()
    };
  }
  const result = await checkForAppUpdate(app.getVersion());
  pendingAppUpdateDownload = result.status === "update_available"
    && result.latestVersion
    && result.downloadUrl
    ? { version: result.latestVersion, downloadUrl: result.downloadUrl }
    : null;
  return {
    status: result.status,
    currentVersion: result.currentVersion,
    ...(result.latestVersion ? { latestVersion: result.latestVersion } : {})
  };
});

ipcMain.handle("app:downloadUpdate", async (event) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || !pendingAppUpdateDownload) {
    return { status: "failed" };
  }
  const update = pendingAppUpdateDownload;
  try {
    await shell.openExternal(update.downloadUrl);
    return { status: "download_started", version: update.version };
  } catch {
    return { status: "failed", version: update.version };
  }
});

ipcMain.handle("preview:open", (event, data: PreviewWindowData) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return false;
  }
  if (
    !data
    || typeof data.sessionId !== "string"
    || typeof data.filePath !== "string"
    || typeof data.previewUrl !== "string"
    || (data.provider !== undefined
      && data.provider !== "image"
      && data.provider !== "fileInfo"
      && data.provider !== "folderInfo"
      && data.provider !== "text"
      && data.provider !== "audio"
      && data.provider !== "video")
    || (data.provider !== undefined && (!data.info || data.info.path !== data.filePath))
    || (data.provider === "text" && (!data.textPreview || typeof data.textPreview.content !== "string"))
    || typeof data.skimActive !== "boolean"
    || (data.theme !== "light" && data.theme !== "dark")
  ) {
    return false;
  }

  logPreviewLifecycle("open-request", {
    sessionId: data.sessionId,
    source: data.skimActive ? "skim" : "results",
    provider: data.provider ?? "image",
    previousSessionId: activePreviewData?.sessionId ?? null,
    mainVisible: mainWindow.isVisible(),
    previewVisible: Boolean(previewWindow && !previewWindow.isDestroyed() && previewWindow.isVisible())
  });

  if (activeSkimFolderStatsTask && activeSkimFolderStatsTask.sessionId !== data.sessionId) {
    activeSkimFolderStatsTask.cancelled = true;
    activeSkimFolderStatsTask = null;
  }
  if (latestSkimFolderStatsUpdate?.sessionId !== data.sessionId) {
    latestSkimFolderStatsUpdate = null;
  }

  createPreviewWindow();
  const isOpeningSession = !previewSessionActive;
  if (isOpeningSession) {
    centerPreviewWindowForNewSession();
  }
  previewSessionActive = true;
  activePreviewData = data;
  latestPreviewContentSize = null;
  sendActivePreviewData();
  if (isOpeningSession && previewWindowLoaded) {
    revealPreviewWindow();
  }
  return true;
});

ipcMain.handle("preview:close", (event) => {
  const isMainRenderer = Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents);
  const isPreviewRenderer = Boolean(previewWindow && !previewWindow.isDestroyed() && event.sender === previewWindow.webContents);
  if (!isMainRenderer && !isPreviewRenderer) {
    return false;
  }
  const sessionId = activePreviewData?.sessionId ?? null;
  const source = activePreviewData ? (activePreviewData.skimActive ? "skim" : "results") : null;
  const closed = closePreviewSession();
  logPreviewLifecycle("close", {
    requestedBy: isMainRenderer ? "main-renderer" : "preview-renderer",
    sessionId,
    source,
    closed,
    mainVisible: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()),
    previewVisible: Boolean(previewWindow && !previewWindow.isDestroyed() && previewWindow.isVisible())
  });
  return closed;
});

ipcMain.handle("preview:getWindowControlState", (event) => {
  if (!previewWindow || previewWindow.isDestroyed() || event.sender !== previewWindow.webContents) {
    return getPreviewWindowControlState();
  }
  return getPreviewWindowControlState();
});

ipcMain.handle("preview:toggleMaximized", (event) => {
  if (!previewWindow || previewWindow.isDestroyed() || event.sender !== previewWindow.webContents) {
    return getPreviewWindowControlState();
  }
  if (previewWindow.isMaximized()) {
    previewWindow.once("unmaximize", applyLatestPreviewContentSize);
    previewWindow.unmaximize();
  } else {
    previewWindow.maximize();
  }
  return getPreviewWindowControlState();
});

ipcMain.handle("preview:toggleAlwaysOnTop", async (event) => {
  if (!previewWindow || previewWindow.isDestroyed() || event.sender !== previewWindow.webContents) {
    return getPreviewWindowControlState();
  }
  const preferences = await updateAlwaysOnTopPreference(!shellAlwaysOnTop);
  shellAlwaysOnTop = preferences.alwaysOnTop;
  applyAlwaysOnTopState();
  sendAlwaysOnTopStateToRenderer();
  return getPreviewWindowControlState();
});

ipcMain.handle("preview:openSettings", (event) => {
  if (!previewWindow || previewWindow.isDestroyed() || event.sender !== previewWindow.webContents) {
    return false;
  }
  closePreviewSession();
  openSettingsFromTray();
  return true;
});

ipcMain.handle("preview:toggleSkim", (event) => {
  if (!previewWindow || previewWindow.isDestroyed() || event.sender !== previewWindow.webContents) {
    return false;
  }
  closePreviewSession();
  sendToggleSkimToRenderer();
  return true;
});

ipcMain.handle("preview:itemAction", (event, request: PreviewItemActionRequest) => {
  if (
    !previewSessionActive
    || !activePreviewData
    || !previewWindow
    || previewWindow.isDestroyed()
    || event.sender !== previewWindow.webContents
    || !request
    || (request.action !== "editKeywords" && request.action !== "deleteFile")
    || request.itemId !== activePreviewData.itemId
    || request.filePath !== activePreviewData.filePath
  ) {
    return false;
  }

  const validatedRequest: PreviewItemActionRequest = {
    action: request.action,
    itemId: activePreviewData.itemId,
    filePath: activePreviewData.filePath
  };
  closePreviewSession();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("preview:itemAction", validatedRequest);
    return true;
  }
  return false;
});

ipcMain.on("preview:navigate", (event, direction: PreviewNavigateDirection) => {
  if (
    !previewSessionActive
    || !previewWindow
    || previewWindow.isDestroyed()
    || event.sender !== previewWindow.webContents
    || (direction !== -1 && direction !== 1)
  ) {
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("preview:navigate", direction);
  }
});

ipcMain.on("preview:data", (event) => {
  if (
    previewWindow
    && !previewWindow.isDestroyed()
    && event.sender === previewWindow.webContents
  ) {
    sendActivePreviewData();
  }
});

ipcMain.on("preview:contentSize", (event, size: PreviewContentSize) => {
  if (
    !previewSessionActive
    || !activePreviewData
    || !previewWindow
    || previewWindow.isDestroyed()
    || event.sender !== previewWindow.webContents
    || size?.sessionId !== activePreviewData.sessionId
    || size?.filePath !== activePreviewData.filePath
    || !Number.isFinite(size?.width)
    || !Number.isFinite(size?.height)
  ) {
    return;
  }

  latestPreviewContentSize = { ...size };
  applyLatestPreviewContentSize();
  if (!previewWindow.isVisible()) {
    revealPreviewWindow();
  }
  applyAlwaysOnTopState();
  previewWindow.focus();
});

ipcMain.handle("file:open", async (_event, filePath: string) => {
  return shell.openPath(filePath);
});

ipcMain.handle("file:showInFolder", (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle("file:moveToTrash", async (_event, filePaths: unknown) => {
  const requestedPaths = Array.isArray(filePaths)
    ? filePaths.filter((filePath): filePath is string => typeof filePath === "string" && filePath.trim().length > 0)
    : [];
  if (!app.isPackaged) {
    console.debug("[file-delete:ipc] request", { requestedPaths });
  }
  try {
    const result = await moveIndexedImagesToTrash(requestedPaths);
    if (!app.isPackaged) {
      console.debug("[file-delete:ipc] result", result);
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : t("error.fileDeleteServiceFailed");
    console.warn("[file-delete:ipc] failed before a result was produced", error);
    return {
      success: false,
      totalCount: requestedPaths.length,
      deletedPaths: [],
      failedItems: requestedPaths.map((filePath) => ({ path: filePath, error: message }))
    };
  }
});

ipcMain.on("file:startDrag", (event, filePaths: string[]) => {
  try {
    startNativeFileDrag(event.sender, filePaths);
  } catch (error) {
    const message = error instanceof Error ? error.message : t("error.fileDragStartFailed");
    console.warn("[file-drag] failed", { message });
  }
});

const withSqliteImageCounts = async (directories: PersistedDirectory[]) => {
  const directoryIds = directories.map((directory) => directory.id);
  const counts = await getExistingImageCountsByDirectory(directoryIds);
  return directories.map((directory) => ({
    ...directory,
    indexedCount: (counts[directory.id] ?? 0) > 0 ? counts[directory.id] : directory.indexedCount
  }));
};

const runAiIndexBatch = async (directoryId?: string) => {
  const startedAt = Date.now();
  await pauseThumbnailOptimization("ai-recognition");
  try {
    const ai = await runContinuousAiIndex({
      directoryId,
      limit: 5,
      language: getActiveLanguage(),
      shouldCancel: () => cancelAiIndexRequested,
      onProgress: (progress) => {
        mainWindow?.webContents.send("ai:indexProgress", progress);
      }
    }).catch((error) => {
      const message = error instanceof Error ? error.message : t("error.recognitionFailed");
      mainWindow?.webContents.send("ai:indexProgress", {
        phase: "failed",
        total: 0,
        current: 0,
        completed: 0,
        failed: 0,
        cancellable: false,
        message
      });
      return {
        total: 0,
        completed: 0,
        failed: 0,
        cancelled: false,
        errors: [
          {
            filePath: "",
            fileName: "",
            message
          }
        ]
      };
    });

    const result = {
      ai,
      stats: await getImageIndexQualityStats()
    };
    if (
      !cancelAiIndexRequested
      && ai.cancelled !== true
      && Date.now() - startedAt >= backgroundTaskNotificationMinimumMs
      && isMainWindowInBackground()
    ) {
      const fatalFailure = ai.total === 0 && ai.errors.length > 0;
      if (fatalFailure) {
        showSystemNotification(
          t("notification.aiFailedTitle"),
          t("notification.aiFailedContent")
        );
      } else if (ai.total > 0) {
        showSystemNotification(
          t("notification.aiCompletedTitle"),
          t("notification.aiCompletedContent", { completed: ai.completed, failed: ai.failed })
        );
      }
    }
    return result;
  } finally {
    resumeThumbnailOptimization("ai-recognition");
  }
};

ipcMain.handle("directories:list", async () => {
  return withSqliteImageCounts(await listDirectories());
});

const withDirectoryAddSqliteCounts = async (result: DirectoryAddResult): Promise<DirectoryAddResult> => ({
  ...result,
  directories: await withSqliteImageCounts(result.directories)
});

const addDirectoryCandidatesWithIndexMigrationInternal = async (request: DirectoryAddRequest) => {
  const result = await addDirectoryCandidates(request);
  try {
    await reassignDirectoryImages(result.replacements.map((replacement) => ({
      fromDirectoryIds: replacement.replacedDirectories.map((directory) => directory.id),
      toDirectoryId: replacement.directory.id,
      toDirectoryPath: replacement.directory.path
    })));
    searchScanSnapshotService.invalidate([
      ...result.added.map((directory) => directory.id),
      ...result.replacements.flatMap((replacement) => replacement.replacedDirectories.map((directory) => directory.id))
    ]);
  } catch (error) {
    const replacementIds = new Set(result.replacements.map((replacement) => replacement.directory.id));
    const restoredDirectories = [
      ...result.directories.filter((directory) => !replacementIds.has(directory.id)),
      ...result.replacements.flatMap((replacement) => replacement.replacedDirectories)
    ];
    try {
      await replaceDirectories(restoredDirectories);
    } catch (rollbackError) {
      console.warn("[directory-add] failed to restore directory configuration after index migration failure", rollbackError);
    }
    throw error;
  }
  return result;
};

let directoryAddQueue: Promise<void> = Promise.resolve();

const addDirectoryCandidatesWithIndexMigration = (request: DirectoryAddRequest) => {
  const task = directoryAddQueue.then(() => addDirectoryCandidatesWithIndexMigrationInternal(request));
  directoryAddQueue = task.then(() => undefined, () => undefined);
  return task;
};

const normalizeDirectoryAddRequest = (value: unknown): DirectoryAddRequest => {
  if (!value || typeof value !== "object") {
    return { candidates: [] };
  }
  const candidate = value as { candidates?: unknown; conflictResolution?: unknown };
  return {
    candidates: Array.isArray(candidate.candidates)
      ? candidate.candidates as string[]
      : [],
    conflictResolution: candidate.conflictResolution === "replace-existing" ? "replace-existing" : "prompt"
  };
};

ipcMain.handle("directories:selectAndAdd", async () => {
  const options: OpenDialogOptions = {
    title: t("dialog.selectIndexDirectory"),
    properties: ["openDirectory", "multiSelections"]
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return withDirectoryAddSqliteCounts(await createCancelledDirectoryAddResult());
  }

  return withDirectoryAddSqliteCounts(await addDirectoryCandidatesWithIndexMigration({ candidates: result.filePaths }));
});

ipcMain.handle("directories:addCandidates", async (_event, request: unknown) => {
  return withDirectoryAddSqliteCounts(await addDirectoryCandidatesWithIndexMigration(normalizeDirectoryAddRequest(request)));
});

interface SkimReadTaskState {
  cancelled: boolean;
}

const skimReadTasks = new Map<string, SkimReadTaskState>();

ipcMain.handle("skim:read", async (_event, request: unknown) => {
  const candidate = request && typeof request === "object"
    ? request as { taskId?: unknown; path?: unknown }
    : {};
  const taskId = typeof candidate.taskId === "string" ? candidate.taskId.trim() : "";
  const requestedPath = candidate.path === null || typeof candidate.path === "string" ? candidate.path : undefined;
  if (!taskId || taskId.length > 128 || requestedPath === undefined) {
    throw new Error(t("skim.invalidRequest"));
  }

  const task = skimReadTasks.get(taskId) ?? { cancelled: false };
  skimReadTasks.set(taskId, task);
  try {
    const addedDirectoryPaths = requestedPath === null
      ? []
      : (await listDirectories()).map((directory) => directory.path);
    const result = await readSkimLocation(requestedPath, () => task.cancelled, addedDirectoryPaths);
    return { taskId, ...result };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      throw new Error(t("skim.accessDenied"));
    }
    if (code === "ENOENT" || code === "ENOTDIR" || code === "EINVAL") {
      throw new Error(t("skim.directoryUnavailable"));
    }
    throw new Error(t("skim.readFailed"));
  } finally {
    if (skimReadTasks.get(taskId) === task) {
      skimReadTasks.delete(taskId);
    }
  }
});

ipcMain.handle("skim:cancel", (_event, taskId: unknown) => {
  if (typeof taskId !== "string" || !taskId.trim() || taskId.length > 128) {
    return false;
  }
  const normalizedTaskId = taskId.trim();
  const task = skimReadTasks.get(normalizedTaskId);
  if (!task) {
    return false;
  }
  task.cancelled = true;
  return true;
});

ipcMain.handle("skim:beginVisualSession", (_event, sessionId: unknown) => (
  typeof sessionId === "string" && sessionId.trim().length > 0 && sessionId.length <= 128
    ? beginSkimVisualSession(sessionId.trim())
    : false
));

ipcMain.handle("skim:cancelVisualSession", (_event, sessionId: unknown) => (
  typeof sessionId === "string" && sessionId.trim().length > 0 && sessionId.length <= 128
    ? cancelSkimVisualSession(sessionId.trim())
    : false
));

ipcMain.handle("skim:inspect", async (_event, request: unknown) => {
  const candidate = request && typeof request === "object"
    ? request as { path?: unknown; kind?: unknown }
    : {};
  if (
    typeof candidate.path !== "string"
    || (candidate.kind !== "file" && candidate.kind !== "folder")
  ) {
    throw new Error(t("skim.invalidRequest"));
  }
  try {
    const directories = await listDirectories();
    return await inspectSkimEntry(candidate.path, candidate.kind, directories.map((directory) => directory.path));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") throw new Error(t("skim.accessDenied"));
    if (code === "ENOENT" || code === "ENOTDIR" || code === "EINVAL") throw new Error(t("skim.directoryUnavailable"));
    throw new Error(t("skim.readFailed"));
  }
});

ipcMain.handle("skim:readTextPreview", async (event, filePath: unknown) => {
  if (
    !mainWindow
    || mainWindow.isDestroyed()
    || event.sender !== mainWindow.webContents
    || typeof filePath !== "string"
  ) {
    throw new Error(t("skim.invalidRequest"));
  }
  return readSkimTextPreview(filePath);
});

ipcMain.handle("skim:startFolderStats", (event, request: unknown) => {
  const candidate = request && typeof request === "object"
    ? request as { sessionId?: unknown; path?: unknown }
    : {};
  if (
    !mainWindow
    || mainWindow.isDestroyed()
    || event.sender !== mainWindow.webContents
    || typeof candidate.sessionId !== "string"
    || typeof candidate.path !== "string"
    || !activePreviewData
    || activePreviewData.sessionId !== candidate.sessionId
    || activePreviewData.filePath !== candidate.path
    || activePreviewData.provider !== "folderInfo"
  ) {
    return false;
  }

  if (activeSkimFolderStatsTask) activeSkimFolderStatsTask.cancelled = true;
  const task = { sessionId: candidate.sessionId, path: candidate.path, cancelled: false };
  activeSkimFolderStatsTask = task;
  void collectSkimFolderStats(
    task.path,
    () => task.cancelled || activeSkimFolderStatsTask !== task,
    (stats) => {
      latestSkimFolderStatsUpdate = {
        sessionId: task.sessionId,
        path: task.path,
        ...stats
      };
      if (
        !task.cancelled
        && activeSkimFolderStatsTask === task
        && previewWindow
        && !previewWindow.isDestroyed()
      ) {
        previewWindow.webContents.send("skim:folderStats", latestSkimFolderStatsUpdate);
      }
    }
  ).finally(() => {
    if (activeSkimFolderStatsTask === task) activeSkimFolderStatsTask = null;
  });
  return true;
});

ipcMain.handle("skim:cancelFolderStats", (_event, sessionId: unknown) => {
  if (typeof sessionId !== "string" || activeSkimFolderStatsTask?.sessionId !== sessionId) {
    return false;
  }
  activeSkimFolderStatsTask.cancelled = true;
  activeSkimFolderStatsTask = null;
  return true;
});

ipcMain.handle("directories:updateName", async (_event, id: string, name: string) => {
  return withSqliteImageCounts(await updateDirectoryName(id, name));
});

ipcMain.handle("directories:delete", async (_event, id: string) => {
  searchScanSnapshotService.invalidate([id]);
  const directory = (await listDirectories()).find((item) => item.id === id);
  const deletedFilePaths = await deleteDirectoryImages(id);
  if (directory) {
    await deleteThumbnailsForDirectory(directory.path, deletedFilePaths);
  } else {
    await deleteThumbnailsForImages(deletedFilePaths);
  }
  const directories = await deleteDirectory(id);
  return withSqliteImageCounts(directories);
});

ipcMain.handle("scan:allDirectories", async () => {
  cancelAiIndexRequested = false;
  const cleanupResult = await cleanupMissingIndexedImages();
  cleanupResult.errors.forEach((message) => console.warn(`[stale-image-cleanup] ${message}`));
  const fileCleanupResult = await cleanupMissingIndexedFiles();
  fileCleanupResult.errors.forEach((message) => console.warn(`[stale-file-cleanup] ${message}`));
  const directories = await listDirectories();
  const scanResult = await scanImageDirectories(directories);
  searchScanSnapshotService.seed(directories, scanResult);
  const counts = await writeScannedImagesToIndex(
    directories.map((directory) => directory.id),
    scanResult.images,
    scanResult.scannedAt,
    scanResult.files
  );
  const summaries = scanResult.summaries.map((summary) => ({
    ...summary,
    indexedCount: counts[summary.id] ?? 0
  }));
  const updatedDirectories = await withSqliteImageCounts(await applyDirectoryScanSummaries(summaries));
  const aiResult = await runAiIndexBatch();
  enqueueScannedThumbnails(scanResult.images);

  return {
    directories: updatedDirectories,
    imageCount: Object.values(counts).reduce((sum, count) => sum + count, 0),
    scanResultPath: getImageDatabasePath(),
    results: scanResult.directories,
    ai: aiResult.ai,
    removedFilePaths: cleanupResult.removedFilePaths
  };
});

ipcMain.handle("scan:directory", async (_event, directoryId: string) => {
  cancelAiIndexRequested = false;
  const directories = await listDirectories();
  const directory = directories.find((item) => item.id === directoryId);
  if (!directory) {
    throw new Error(t("error.directoryDoesNotExist"));
  }

  const cleanupResult = await cleanupMissingIndexedImages(directory.id);
  cleanupResult.errors.forEach((message) => console.warn(`[stale-image-cleanup] ${message}`));
  const fileCleanupResult = await cleanupMissingIndexedFiles(directory.id);
  fileCleanupResult.errors.forEach((message) => console.warn(`[stale-file-cleanup] ${message}`));
  const scanResult = await scanImageDirectories([directory]);
  searchScanSnapshotService.seed([directory], scanResult);
  const counts = await writeScannedImagesToIndex(
    [directory.id],
    scanResult.images,
    scanResult.scannedAt,
    scanResult.files
  );
  const summaries = scanResult.summaries.map((summary) => ({
    ...summary,
    indexedCount: counts[summary.id] ?? 0
  }));
  const updatedDirectories = await withSqliteImageCounts(await applyDirectoryScanSummaries(summaries));
  const aiResult = await runAiIndexBatch(directory.id);
  enqueueScannedThumbnails(scanResult.images);

  return {
    directories: updatedDirectories,
    imageCount: counts[directory.id] ?? 0,
    scanResultPath: getImageDatabasePath(),
    results: scanResult.directories,
    ai: aiResult.ai,
    removedFilePaths: cleanupResult.removedFilePaths
  };
});

ipcMain.handle("search:images", async (event, search, taskId: unknown) => {
  if (
    !mainWindow
    || mainWindow.isDestroyed()
    || event.sender !== mainWindow.webContents
    || typeof taskId !== "string"
    || !taskId.trim()
    || taskId.length > 128
  ) {
    throw new Error(t("search.failed"));
  }
  const normalizedTaskId = taskId.trim();
  const task = { cancelled: false };
  searchTasks.set(normalizedTaskId, task);
  try {
    return await searchImagesWithAddedDirectories(
      search,
      await listDirectories(),
      enqueueScannedThumbnails,
      { isCancelled: () => task.cancelled }
    );
  } finally {
    if (searchTasks.get(normalizedTaskId) === task) {
      searchTasks.delete(normalizedTaskId);
    }
  }
});

ipcMain.handle("search:cancel", (event, taskId: unknown) => {
  if (
    !mainWindow
    || mainWindow.isDestroyed()
    || event.sender !== mainWindow.webContents
    || typeof taskId !== "string"
    || !taskId.trim()
    || taskId.length > 128
  ) {
    return false;
  }
  const task = searchTasks.get(taskId.trim());
  if (!task) return false;
  task.cancelled = true;
  return true;
});

const getManualMetadataImage = async (
  filePath: string,
  directories: PersistedDirectory[]
): Promise<ScannedImageFile> => {
  const resolvedFilePath = path.resolve(filePath);
  const ownerDirectory = directories
    .filter((directory) => {
      const relativePath = path.relative(path.resolve(directory.path), resolvedFilePath);
      return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
    })
    .sort((left, right) => right.path.length - left.path.length)[0];
  if (!ownerDirectory) {
    throw new Error(t("error.fileOutsideAddedDirectories"));
  }

  const sourceStat = await fs.stat(resolvedFilePath);
  if (!sourceStat.isFile()) {
    throw new Error(t("error.fileMissingOrStale"));
  }

  return {
    directory_id: ownerDirectory.id,
    directory_path: ownerDirectory.path,
    file_path: resolvedFilePath,
    file_name: path.basename(resolvedFilePath),
    file_size: sourceStat.size,
    created_at: sourceStat.birthtime.toISOString(),
    modified_at: sourceStat.mtime.toISOString(),
    modified_ms: sourceStat.mtimeMs
  };
};

ipcMain.handle("index:updateManualMetadata", async (_event, filePath: string, caption: string, keywordText: string) => {
  if (typeof filePath !== "string" || !filePath.trim() || !isSupportedImageFilePath(filePath)) {
    throw new Error(t("error.invalidFile"));
  }
  if (typeof caption !== "string" || typeof keywordText !== "string") {
    throw new Error(t("error.invalidMetadata"));
  }

  const directories = await listDirectories();
  const image = await getManualMetadataImage(filePath, directories);
  const normalizedKeywords = parseKeywordText(keywordText);
  await upsertImageManualMetadata(
    image,
    caption.trim(),
    normalizedKeywords,
    new Date().toISOString()
  );
  return true;
});

ipcMain.handle("index:updateKeywordsBatch", async (event, request: KeywordBatchUpdateRequest): Promise<KeywordBatchUpdateResult> => {
  const totalCount = Array.isArray(request?.targets) ? request.targets.length : 0;
  const normalizedKeywordText = typeof request?.targetKeywordText === "string"
    ? formatKeywordText(parseKeywordText(request.targetKeywordText))
    : "";
  const failureResult = (error: unknown): KeywordBatchUpdateResult => ({
    success: false,
    totalCount,
    failedCount: totalCount,
    errorMessage: error instanceof Error ? error.message : t("error.batchKeywordFailed"),
    normalizedKeywordText
  });

  try {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error(t("error.invalidBatchKeywordSource"));
    }
    if (!Array.isArray(request.targets) || request.targets.length === 0) {
      throw new Error(t("error.noBatchKeywordSelection"));
    }
    if (!Array.isArray(request.initialCommonKeywords) || typeof request.targetKeywordText !== "string") {
      throw new Error(t("error.invalidBatchKeywordParameters"));
    }

    const seenTargets = new Set<string>();
    const directories = await listDirectories();
    const targets = await Promise.all(request.targets.map(async (target) => {
      if (typeof target?.filePath !== "string" || !target.filePath.trim()) {
        throw new Error(t("error.invalidBatchKeywordTarget"));
      }
      const filePath = path.resolve(target.filePath);
      if (!isSupportedImageFilePath(filePath)) {
        throw new Error(t("error.unsupportedFile", { path: target.filePath }));
      }
      const targetKey = filePath.toLowerCase();
      if (seenTargets.has(targetKey)) {
        throw new Error(t("error.duplicateBatchKeywordTarget"));
      }
      seenTargets.add(targetKey);
      return { image: await getManualMetadataImage(filePath, directories) };
    }));

    const normalizedTargetKeywords = await updateImageKeywordsBatch(
      targets,
      normalizeKeywordList(request.initialCommonKeywords),
      request.targetKeywordText
    );
    return {
      success: true,
      totalCount,
      failedCount: 0,
      errorMessage: "",
      normalizedKeywordText: formatKeywordText(normalizedTargetKeywords)
    };
  } catch (error) {
    return failureResult(error);
  }
});

ipcMain.handle("index:qualityStats", async () => {
  return getImageIndexQualityStats();
});

ipcMain.handle("index:continueRecognition", async () => {
  cancelAiIndexRequested = false;
  const cleanupResult = await cleanupMissingIndexedImages();
  cleanupResult.errors.forEach((message) => console.warn(`[stale-image-cleanup] ${message}`));
  return {
    ...await runAiIndexBatch(),
    removedFilePaths: cleanupResult.removedFilePaths
  };
});

ipcMain.handle("index:cancelRecognition", () => {
  cancelAiIndexRequested = true;
  return true;
});

ipcMain.handle("llamaRuntime:settings", () => {
  return getLlamaRuntimeSettings();
});

ipcMain.handle("llamaRuntime:updateSelected", async (_event, selectedVersion: string) => {
  const processState = getLlamaRuntimeProcessState();
  if (processState.status === "starting" || processState.status === "running") {
    throw new Error(t("error.stopServerBeforeRuntimeSwitch"));
  }
  const settings = await updateSelectedLlamaRuntime(selectedVersion);
  await syncIdleLlamaRuntimeSelectionState();
  return settings;
});

ipcMain.handle("llamaRuntime:processState", () => {
  return getLlamaRuntimeProcessState();
});

ipcMain.handle("llamaRuntime:start", () => {
  return startLlamaRuntime();
});

ipcMain.handle("llamaRuntime:stop", () => {
  return stopLlamaRuntime();
});

ipcMain.handle("ggufModels:settings", () => {
  return getGgufModelSettings();
});

ipcMain.handle("ggufModels:updateSelected", async (_event, selectedModelId: string) => {
  const processState = getLlamaRuntimeProcessState();
  if (processState.status === "starting" || processState.status === "running") {
    throw new Error(t("error.stopServerBeforeModelSwitch"));
  }
  const settings = await updateSelectedGgufModel(selectedModelId);
  await syncIdleLlamaRuntimeSelectionState();
  return settings;
});

ipcMain.handle("preferences:get", () => {
  return getUserPreferences();
});

ipcMain.handle("preferences:updateTheme", async (_event, themePreference: "system" | "light" | "dark") => {
  return updateThemePreference(themePreference);
});

ipcMain.handle("preferences:updateLanguage", async (_event, languagePreference: LanguagePreference) => {
  const nextLanguagePreference = languagePreference === "zh-CN" || languagePreference === "en-US"
    ? languagePreference
    : "system";
  return applyLanguagePreference(nextLanguagePreference);
});

ipcMain.handle("preferences:updateSort", async (_event, sortPreference: { sortField: "file_name" | "modified_at"; sortDirection: "asc" | "desc" }) => {
  const preferences = await updateSortPreference(sortPreference);
  setThumbnailOptimizationSort(preferences.sortPreference.sortField, preferences.sortPreference.sortDirection);
  return preferences;
});

ipcMain.handle("preferences:updateAppearanceColors", async (_event, appearanceColors: { themeColor: string; accentColor: string }) => {
  return updateAppearanceColorsPreference(appearanceColors);
});

ipcMain.handle("preferences:updateEdgeSnap", async (_event, nextEdgeSnapEnabled: boolean) => {
  return setEdgeSnapEnabled(Boolean(nextEdgeSnapEnabled));
});

ipcMain.handle("preferences:updateStandbyLineVisible", async (_event, nextStandbyLineVisible: boolean) => {
  return setStandbyLineVisible(Boolean(nextStandbyLineVisible));
});

ipcMain.handle("preferences:updateLaunchAtLogin", async (_event, nextLaunchAtLogin: boolean) => {
  const preferences = await updateLaunchAtLoginPreference(Boolean(nextLaunchAtLogin));
  applyLaunchAtLoginPreference(preferences.launchAtLogin);
  return preferences;
});

ipcMain.handle("preferences:updateSystemNotifications", async (_event, nextEnabled: boolean) => {
  const preferences = await updateSystemNotificationsPreference(Boolean(nextEnabled));
  systemNotificationsEnabled = preferences.systemNotificationsEnabled;
  return preferences;
});

ipcMain.handle("preferences:updateOperationHints", async (_event, nextEnabled: boolean) => {
  return updateOperationHintsPreference(Boolean(nextEnabled));
});

ipcMain.handle("preferences:updateAutoCacheOptimization", async (_event, nextEnabled: boolean) => {
  const preferences = await updateAutoCacheOptimizationPreference(Boolean(nextEnabled));
  await setThumbnailOptimizationEnabled(preferences.autoCacheOptimizationEnabled);
  if (preferences.autoCacheOptimizationEnabled) {
    void scheduleRecognizedModelInputCacheCleanup();
  }
  return preferences;
});

ipcMain.handle("preferences:updateQuickActionGlobalEnabled", async (_event, nextQuickActionGlobalEnabled: boolean) => {
  const shouldEnable = Boolean(nextQuickActionGlobalEnabled);

  if (!shouldEnable) {
    quickActionGlobalEnabled = false;
    unregisterConfiguredGlobalShortcuts();
    const currentPreferences = await getUserPreferences();
    probeGlobalShortcutActions(currentPreferences.shortcutActions);
    return updateQuickActionGlobalEnabledPreference(false);
  }

  const currentPreferences = await getUserPreferences();
  registerConfiguredGlobalShortcuts(currentPreferences.shortcutActions);
  const preferences = await updateQuickActionGlobalEnabledPreference(true);
  quickActionGlobalEnabled = preferences.quickActionGlobalEnabled;
  return preferences;
});

ipcMain.handle("preferences:updateCommandEnabled", async (_event, nextCommandEnabled: boolean) => {
  return updateCommandEnabledPreference(Boolean(nextCommandEnabled));
});

ipcMain.handle("preferences:updateSearchLabelVisibility", async (_event, nextVisibility: {
  directory: boolean;
  recognition: boolean;
  sort: boolean;
  format: boolean;
  skimDisplay: boolean;
}) => {
  return updateSearchLabelVisibilityPreference({
    directory: Boolean(nextVisibility?.directory),
    recognition: Boolean(nextVisibility?.recognition),
    sort: Boolean(nextVisibility?.sort),
    format: Boolean(nextVisibility?.format),
    skimDisplay: Boolean(nextVisibility?.skimDisplay)
  });
});

ipcMain.handle("preferences:updateSkimDisplay", async (_event, nextSkimDisplay: {
  mode: "skim" | "all" | "custom";
  customExtensions: string[];
  showHiddenFiles: boolean;
}) => updateSkimDisplayPreference(nextSkimDisplay));

ipcMain.handle("preferences:updateShortcutActions", async (_event, shortcutActions: {
  activateCapsule: string;
  activateMicro: string;
  activateMini: string;
  activateNormal: string;
  activateStandby: string;
  activateSkim: string;
  openSettings: string;
}) => {
  const currentPreferences = await getUserPreferences();
  const candidateShortcutActions = shortcutActions as ShortcutActionPreferences;
  quickActionGlobalEnabled = currentPreferences.quickActionGlobalEnabled;
  const unavailableActionIds = quickActionGlobalEnabled && !shortcutCaptureActive
    ? registerConfiguredGlobalShortcuts(candidateShortcutActions)
    : probeGlobalShortcutActions(candidateShortcutActions);

  if (unavailableActionIds.size > 0) {
    if (quickActionGlobalEnabled && !shortcutCaptureActive) {
      registerConfiguredGlobalShortcuts(currentPreferences.shortcutActions);
    }
    return {
      applied: false,
      preferences: currentPreferences,
      unavailableActionIds: Array.from(unavailableActionIds)
    };
  }

  let preferences;
  try {
    preferences = await updateShortcutActionsPreference(candidateShortcutActions);
  } catch (error) {
    if (quickActionGlobalEnabled) {
      registerConfiguredGlobalShortcuts(currentPreferences.shortcutActions);
    }
    throw error;
  }
  quickActionGlobalEnabled = preferences.quickActionGlobalEnabled;
  if (quickActionGlobalEnabled && !shortcutCaptureActive) {
    unavailableGlobalShortcutActionIds = new Set();
  } else {
    unregisterConfiguredGlobalShortcuts();
    unavailableGlobalShortcutActionIds = new Set();
  }
  return {
    applied: true,
    preferences,
    unavailableActionIds: []
  };
});

ipcMain.handle("preferences:shortcutAvailability", () => shortcutAvailabilityResponse());

ipcMain.handle("preferences:beginShortcutCapture", () => {
  if (!shortcutCaptureActive) {
    shortcutCaptureActive = true;
    unregisterConfiguredGlobalShortcuts();
  }
  return true;
});

ipcMain.handle("preferences:endShortcutCapture", async () => {
  if (!shortcutCaptureActive) {
    return shortcutAvailabilityResponse();
  }

  shortcutCaptureActive = false;
  const preferences = await getUserPreferences();
  quickActionGlobalEnabled = preferences.quickActionGlobalEnabled;
  if (!quickActionGlobalEnabled) {
    probeGlobalShortcutActions(preferences.shortcutActions);
    return shortcutAvailabilityResponse();
  }

  registerConfiguredGlobalShortcuts(preferences.shortcutActions);
  return shortcutAvailabilityResponse();
});

ipcMain.handle("cache:stats", () => {
  return getAllVisualCacheStats();
});

ipcMain.handle("cache:optimizationStatus", () => {
  return getThumbnailOptimizationStatus();
});

ipcMain.handle("cache:setContentViewActive", (event, active: unknown) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return false;
  }
  rendererContentViewActive = active === true;
  syncThumbnailOptimizationActivity();
  return true;
});

ipcMain.handle("cache:authorizeClear", () => {
  const authorization = {
    token: randomUUID(),
    expiresAt: Date.now() + 30_000
  };
  cacheClearAuthorization = authorization;
  return authorization.token;
});

ipcMain.handle("cache:clearAll", async (_event, token?: string) => {
  const authorization = cacheClearAuthorization;
  cacheClearAuthorization = null;
  if (!authorization || token !== authorization.token || Date.now() > authorization.expiresAt) {
    throw new Error(t("error.cacheConfirmationRequired"));
  }
  await setThumbnailOptimizationEnabled(false);
  await updateAutoCacheOptimizationPreference(false);
  return clearAllVisualCaches();
});

ipcMain.handle("skimCache:stats", () => getSkimCacheStats());

ipcMain.handle("skimCache:authorizeClear", () => {
  const authorization = {
    token: randomUUID(),
    expiresAt: Date.now() + 30_000
  };
  skimCacheClearAuthorization = authorization;
  return authorization.token;
});

ipcMain.handle("skimCache:clear", async (_event, token?: string) => {
  const authorization = skimCacheClearAuthorization;
  skimCacheClearAuthorization = null;
  if (!authorization || token !== authorization.token || Date.now() > authorization.expiresAt) {
    throw new Error(t("error.cacheConfirmationRequired"));
  }
  return clearSkimCacheSafely();
});
