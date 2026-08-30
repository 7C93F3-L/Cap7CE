import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeTheme, net, protocol, screen, shell, Tray, type IpcMainInvokeEvent, type OpenDialogOptions } from "electron";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { addDirectoryCandidates, createCancelledDirectoryAddResult, type DirectoryAddRequest } from "./directoryAddService";
import { registerDirectoryManagementIpc } from "./directoryManagementIpc";
import { registerAiSearchIpc } from "./aiSearchIpc";
import { registerDiagnosticsIpc } from "./diagnosticsIpc";
import { bootstrapRuntimeDiagnostics } from "./runtimeDiagnosticsBootstrap";
import { RuntimeDiagnostics } from "./runtimeDiagnostics";
import { createThumbnailFailureResponse } from "./thumbnailFailureResponse";
import { registerSearchIpc } from "./searchIpc";
import { writeAppUpdateDiagnostic } from "./appUpdateDiagnostics";
import { aiSearchService } from "./aiSearchRuntime";
import { configureEmbeddedMetadataRuntime, discardEmbeddedMetadataForDirectory, writeScannedFilesWithEmbeddedMetadata } from "./embeddedMetadataRuntime";
import { createEmbeddedMetadataPreviewCoordinator } from "./embeddedMetadataPreviewProbe";
import { setVisualPropertyForegroundActive } from "./visualPropertyRuntime";
import { AppUpdateDownloadError, checkForAppUpdate, downloadAppUpdate, type AppUpdateDownload, type AppUpdateDownloadErrorCode, type AppUpdateDownloadProgress } from "./appUpdateService";
import { consumeAppUpdateCompletion } from "./appUpdateCompletion";
import { createAppUpdateLauncherScript, resolveWindowsPowerShellPath } from "./appUpdateLauncher";
import { applyDirectoryFileCounts, deleteDirectory, listDirectories, replaceDirectories, type PersistedDirectory, updateDirectoryName } from "./directoryStore";
import { moveIndexedImagesToTrash } from "./fileOperationService";
import { copyFileItemsToClipboard, normalizeFilePathsForClipboard } from "./fileClipboardService";
import { startNativeFileDrag } from "./fileDragService";
import { registerFileIpc } from "./fileIpc";
import { canUseSearchShellThumbnail, getFileFormatCapability } from "./formatCapabilities";
import { getGgufModelSettings, updateSelectedGgufModel } from "./ggufModelStore";
import { searchImagesWithAddedDirectories } from "./imageSearchService";
import { scanImageDirectories, type ScannedImageFile } from "./imageScanner";
import { searchScanSnapshotService } from "./searchScanSnapshotService";
import { getLlamaRuntimeProcessState, onLlamaRuntimeProcessStateChanged, registerLlamaRuntimeShutdownHandler, startLlamaRuntime, stopLlamaRuntime, syncIdleLlamaRuntimeSelectionState } from "./llamaRuntimeManager";
import { getLlamaRuntimeSettings, updateSelectedLlamaRuntime } from "./llamaRuntimeStore";
import { registerRuntimeModelIpc } from "./runtimeModelIpc";
import { cleanupRecognizedModelInputCaches } from "./modelInputCacheCleanupService";
import { getUserPreferences, markBackgroundRunNotificationShown, updateAiRecognitionEnabledPreference, updateAlwaysOnTopPreference, updateAppearanceColorsPreference, updateAutoCacheOptimizationPreference, updateCommandEnabledPreference, updateEdgeCollapsePreference, updateLanguagePreference, updateLaunchAtLoginPreference, updateOperationHintsPreference, updateQuickActionGlobalEnabledPreference, updateRememberWindowLayoutPreference, updateSearchLabelVisibilityPreference, updateShortcutActionsPreference, updateSkimDisplayPreference, updateSkimSidebarFoldersPreference, updateSkimSortPreference, updateSkimSystemLocationsCollapsedPreference, updateSortPreference, updateStandbyLineVisiblePreference, updateSystemNotificationsPreference, updateThemePreference, updateWindowPresentationModePreference } from "./preferenceStore";
import { registerPreferenceIpc } from "./preferenceIpc";
import { registerManualMetadataIpc } from "./manualMetadataIpc";
import { backfillFilePathEvidence, deleteDirectoryImages, ensureImageDatabase, getExistingImageCountsByDirectory, getImageDatabasePath, getLegacyImageDatabasePath, readPreviewEmbeddedMetadata, reassignDirectoryImages, updateManualKeywordsBatch, upsertFileManualKeywords } from "./sqliteImageIndex";
import { readSkimLocation, resolveReadableSkimDirectoryPath } from "./skimBrowseService";
import { collectSkimFolderStats, inspectSkimEntry } from "./skimPreviewService";
import { getSkimMediaMimeType, parseSkimMediaByteRange, readSkimTextPreview, skimAudioPreviewExtensions, skimVideoPreviewExtensions } from "./skimContentPreviewService";
import { beginSkimVisualSession, cancelSkimVisualSession, clearSkimCacheSafely, getSkimCacheStats, requestSkimShellPreviewCache, requestSkimShellThumbnailCache, requestSkimVisualCache, setSkimShellThumbnailActivity } from "./skimVisualCacheService";
import { requestSearchShellPreviewCache, requestSearchShellThumbnailCache, setSearchShellVisualActivity } from "./searchShellVisualCacheService";
import { registerCacheActivityIpc } from "./cacheActivityIpc";
import { registerCacheClearIpc } from "./cacheClearIpc";
import { getShellMousePollDelay } from "./shellMousePollingPolicy";
import { clearAllVisualCaches, clearThumbnailCaches, deleteThumbnailsForDirectory, deleteThumbnailsForImages, discardAllQueuedThumbnailRenders, discardQueuedInteractiveThumbnailRenders, discardQueuedThumbnailRendersForDirectory, ensureThumbnailPath, getAllVisualCacheStats, pauseThumbnailRendering, resumeThumbnailRendering } from "./thumbnailService";
import { discardThumbnailOptimizationCandidatesForDirectory, enqueueThumbnailOptimizationCandidates, getThumbnailOptimizationStatus, pauseThumbnailOptimization, resumeThumbnailOptimization, setThumbnailOptimizationEnabled, setThumbnailOptimizationForegroundActive, setThumbnailOptimizationSort, setThumbnailOptimizationStatusListener, type ThumbnailOptimizationCandidate, type ThumbnailOptimizationStatus } from "./thumbnailOptimizationService";
import { readVisualCacheImage } from "./visualCacheService";
import { getWindowsKnownFolderDisplayNames } from "./windowsKnownFolderDisplayNameService";
import { ensurePreviewImagePath, readVisualSourceDimensions, shouldUseSourceFileForPreview } from "./visualRenderService";
import type { PreviewContentSize, PreviewItemActionRequest, PreviewNavigateDirection, PreviewWindowControlState, PreviewWindowData } from "./previewTypes";
import { resolveLanguagePreference, setActiveLanguage, t, type LanguagePreference } from "./localization";
import { lockWebContentsZoom } from "./webContentsZoomPolicy";
import { LineWindowController } from "./lineWindowController";
import { CapsuleWindowController } from "./capsuleWindowController";
import { installDockedShell } from "./dockedShellAutomation";
import { previewDockedShell } from "./previewDockedShell";
import { WindowLayerController } from "./windowLayerController";
import { getDirectionalLineBounds } from "./windowLayoutGeometry";
import { getDefaultShellLayoutBounds, toWindowLayoutDisplaySnapshot, WindowLayoutManager } from "./windowLayoutManager";
import { WindowLayoutStore } from "./windowLayoutStore";
import type { PersistedWindowLayoutState, WindowDockEdge } from "./windowLayoutTypes";
import { DEFAULT_WINDOW_RESIZE_THRESHOLDS, isStableResizeBounds, resolveResizeTargetState } from "./windowResizeState";
import { CompatibilityNativeMaximizeController } from "./compatibilityNativeMaximizeController";
import { ShellWindowPresentationSizing } from "./shellWindowPresentationSizing";
import { WindowPresentationRuntime } from "./windowPresentationRuntime";
import { normalizeWindowPresentationMode } from "./windowPresentationPolicy";
import { createWindowPresentationSwitchRuntime } from "./windowPresentationSwitchRuntime";
import { closePdfPreviewSession, openPdfPreviewSession, renderPdfPreviewPage } from "./pdfPreviewService";
import { closeOfficePreviewSession, openOfficePreviewSession, prepareOfficePreviewTemporaryRoot } from "./officePreviewService";
import { ArchivePreviewError, closeArchivePreviewSession, openArchivePreviewSession } from "./archivePreviewService";
import { closeFontPreviewSession, FontPreviewError, inspectFontPreviewSource, isFontPreviewRequestAuthorized, openFontPreviewSession } from "./fontPreviewService";
import { closeEpubPreviewSession, EpubPreviewError, openEpubPreviewSession } from "./epubPreviewService";
import { closeMobiPreviewSession, MobiPreviewError, openMobiPreviewSession } from "./mobiPreviewService";

const applicationName = "Cap7CE";
const windowsAppUserModelId = "com.cap7ce.app";
const releasePageUrl = "https://github.com/7C93F3-L/Cap7CE/releases";
app.setName(applicationName);
if (process.platform === "win32" && app.isPackaged) {
  app.setAppUserModelId(windowsAppUserModelId);
}
app.setPath("userData", path.join(app.getPath("appData"), applicationName));
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const runtimeDiagnostics = hasSingleInstanceLock
  ? bootstrapRuntimeDiagnostics()
  : new RuntimeDiagnostics({ userDataPath: app.getPath("userData") });
if (!hasSingleInstanceLock) {
  app.quit();
}

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
const isMainSenderAllowed = (event: IpcMainInvokeEvent) => Boolean(
  mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents
);
let startupHintWindow: BrowserWindow | null = null;
let previewWindow: BrowserWindow | null = null;
let appTray: Tray | null = null;
let pendingSecondInstanceActivation = false;
let mainWindowReadyForActivation = false;
let pendingAppUpdateDownload: AppUpdateDownload | null = null;
let appUpdateDownloadActive = false;
let appUpdateDownloadAbortController: AbortController | null = null;
let isQuitting = false;
const completedUpdateVersionArgument = process.argv
  .map((argument) => argument.match(/^--cap7ce-updated=(\d+\.\d+\.\d+)$/)?.[1] ?? null)
  .find((version): version is string => version !== null) ?? null;

const cleanupStaleAppUpdateLaunchers = async (): Promise<void> => {
  const tempDirectory = app.getPath("temp");
  const entries = await fs.readdir(tempDirectory, { withFileTypes: true });
  const staleBefore = Date.now() - 20_000;
  await Promise.all(entries
    .filter((entry) => entry.isFile()
      && entry.name.startsWith("Cap7CE-update-launcher-")
      && (entry.name.endsWith(".vbs") || entry.name.endsWith(".cmd")))
    .map(async (entry) => {
      const launcherPath = path.join(tempDirectory, entry.name);
      const launcherStats = await fs.stat(launcherPath).catch(() => null);
      if (launcherStats && launcherStats.mtimeMs <= staleBefore) {
        await fs.rm(launcherPath, { force: true }).catch(() => undefined);
      }
    }));
};

const cleanupStaleAppUpdateDownloads = async (): Promise<void> => {
  const tempDirectory = app.getPath("temp");
  const entries = await fs.readdir(tempDirectory, { withFileTypes: true });
  const staleBefore = Date.now() - 24 * 60 * 60 * 1000;
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && /^Cap7CE-update-\d+\.\d+\.\d+-[0-9a-f-]{36}$/i.test(entry.name))
    .map(async (entry) => {
      const candidatePath = path.join(tempDirectory, entry.name);
      const stat = await fs.stat(candidatePath).catch(() => null);
      if (stat && stat.mtimeMs < staleBefore) {
        await fs.rm(candidatePath, { recursive: true, force: true }).catch(() => undefined);
      }
    }));
};

let resizeRepaintTimer: NodeJS.Timeout | null = null;
let resizeSettledTimer: NodeJS.Timeout | null = null;
let shellMousePassthroughTimer: NodeJS.Timeout | null = null;
let hiddenActivationRevealTimer: NodeJS.Timeout | null = null;
let hiddenActivationRevealPending = false;
let lastShellMousePoint: Electron.Point | null = null;
let stationaryShellMousePollCount = 0;
let shellIgnoreMouseEvents = false;
let programmaticResizeGuardUntil = 0;
let moveSnapTimer: NodeJS.Timeout | null = null;
let programmaticMoveGuardUntil = 0;
let previewMoveSnapTimer: NodeJS.Timeout | null = null;
let previewProgrammaticMoveGuardUntil = 0;
let startupHintCloseTimer: NodeJS.Timeout | null = null;
let previewIdleDestroyTimer: NodeJS.Timeout | null = null;
let previewOpenRequestId = 0;
let shellAlwaysOnTop = false;
let shellMaximized = false;
let lastNormalBounds: Electron.Rectangle | null = null;
let activeShellState: Cap7CEShellState = "normal";
let dockedShellController: ReturnType<typeof installDockedShell> | null = null; let edgeCollapseEnabled = false;
let mainWindowSkipTaskbar: boolean | null = null;
let microBottomCenterAnchored = false;
const windowPresentationRuntime = new WindowPresentationRuntime();
let windowLayoutManager = new WindowLayoutManager(new WindowLayoutStore(path.join(app.getPath("userData"), "config", windowPresentationRuntime.layoutFileName)));
const windowPresentationSwitchRuntime = createWindowPresentationSwitchRuntime({
  registrar: ipcMain, isSenderAllowed: isMainSenderAllowed, markerPath: path.join(app.getPath("userData"), "config", "window-presentation-switch.json"),
  getActiveMode: () => windowPresentationRuntime.mode, updatePreference: updateWindowPresentationModePreference,
  flushBeforeRestart: async () => { await Promise.all([windowLayoutManager.flush(), runtimeDiagnostics.flush()]); }, relaunch: () => { delete process.env.CAP7CE_WINDOW_PRESENTATION_MODE; app.relaunch(); },
  setQuitting: () => { isQuitting = true; }, quit: () => app.quit()
});
let standbyLineVisible = true;
let systemNotificationsEnabled = true;
let quickActionGlobalEnabled = true;
let shortcutCaptureActive = false;
let registeredActivateCapsuleShortcut: string | null = null;
const registeredShellModeShortcuts = new Map<string, string>();
type ShortcutActionId = "activateCapsule" | "activateMicro" | "activateMini" | "activateNormal" | "activateStandby" | "activateSkim" | "cycleDirectory" | "openSettings";
type GlobalShortcutActionId = Exclude<ShortcutActionId, "cycleDirectory">;
type ShortcutActionPreferences = Record<ShortcutActionId, string>;
let unavailableGlobalShortcutActionIds = new Set<GlobalShortcutActionId>();
let modelInputCacheCleanupPromise: Promise<void> | null = null;
let rendererContentViewActive = false;
let searchIpcController: ReturnType<typeof registerSearchIpc> | null = null;
let previewWindowLoaded = false;
let previewSessionActive = false;
let activePreviewData: PreviewWindowData | null = null;

const logPreviewLifecycle = (event: string, details: Record<string, unknown>) => {
  if (app.isPackaged) return;
  console.info(`[preview-lifecycle] ${new Date().toISOString()} ${event}`, details);
};
let latestPreviewContentSize: PreviewContentSize | null = null;
let activeSkimFolderStatsTask: { sessionId: string; path: string; cancelled: boolean } | null = null;
let activeFileInfoFolderStatsTask: { taskId: string; path: string; cancelled: boolean } | null = null;
let latestSkimFolderStatsUpdate: ({ sessionId: string; path: string } & Awaited<ReturnType<typeof collectSkimFolderStats>>) | null = null;
let cacheNotificationBatchBaseline: Pick<ThumbnailOptimizationStatus, "processedCount" | "failedCount" | "activeDurationMs"> | null = null;
let lastCacheCompletionNotificationAt = 0;
const previewSourceFallbackExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
type Cap7CEShellState = "standby" | "capsule" | "micro" | "mini" | "normal" | "settings";
const shellWindowStates = new Set<Cap7CEShellState>(["standby", "capsule", "micro", "mini", "normal", "settings"]);
const standbyVisualLengthPx = 180;
const standbyInteractionThicknessPx = 15;
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

let thumbnailOptimizationDiscoveryQueue: Promise<void> = Promise.resolve();

const scheduleDirectoryThumbnailOptimization = (directories: PersistedDirectory[]) => {
  if (directories.length === 0 || !getThumbnailOptimizationStatus().enabled) return;
  const task = thumbnailOptimizationDiscoveryQueue.then(async () => {
    if (!getThumbnailOptimizationStatus().enabled) return;
    const scanResult = await scanImageDirectories(directories, {
      isCancelled: () => !getThumbnailOptimizationStatus().enabled
    });
    await enqueueThumbnailOptimizationCandidates(toThumbnailOptimizationCandidates(scanResult.images));
  });
  thumbnailOptimizationDiscoveryQueue = task.catch((error) => {
    if ((error as NodeJS.ErrnoException)?.code !== "ECANCELED") {
      console.warn("[thumbnail-optimization] added directory scan failed", error);
    }
  });
};

const isVisibleAndFocused = (window: BrowserWindow | null) => Boolean(
  window && !window.isDestroyed() && window.isVisible() && window.isFocused()
);

const syncThumbnailOptimizationActivity = () => {
  const contentViewActive = Boolean(
    rendererContentViewActive
    && mainWindow
    && !mainWindow.isDestroyed()
    && mainWindow.isVisible()
    && mainWindow.isFocused()
    && (activeShellState === "micro" || activeShellState === "mini" || activeShellState === "normal")
  );
  const foregroundWindowActive = isVisibleAndFocused(mainWindow) || isVisibleAndFocused(previewWindow);
  setSkimShellThumbnailActivity(contentViewActive);
  setSearchShellVisualActivity(contentViewActive);
  searchScanSnapshotService.setActive(contentViewActive);
  setThumbnailOptimizationForegroundActive(foregroundWindowActive);
  setVisualPropertyForegroundActive(foregroundWindowActive);
};

const cancelActiveSearchTasks = () => {
  searchIpcController?.cancelAll();
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
const microLayoutMaxHeight = DEFAULT_WINDOW_RESIZE_THRESHOLDS.microToMiniHeight;
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

const getMainWindowTitlebarHeight = () => windowPresentationRuntime.titlebarHeight;
const shellWindowPresentationSizing = new ShellWindowPresentationSizing({
  getTitlebarHeight: getMainWindowTitlebarHeight,
  capsuleWidth: capsuleWidthPx,
  capsuleHeight: capsuleWindowHeightPx,
  microHeight: microDefaultHeightPx,
  miniHeight: miniDefaultHeightPx,
  minimumWidth: resizableShellMinimumWidthPx,
  minimumHeight: resizableShellMinimumHeightPx,
  normalMinimumWidth: DEFAULT_WINDOW_RESIZE_THRESHOLDS.normalToMiniWidth,
  normalMinimumHeight: DEFAULT_WINDOW_RESIZE_THRESHOLDS.normalToMiniHeight,
  miniMaximumWidth: DEFAULT_WINDOW_RESIZE_THRESHOLDS.miniToNormalWidth,
  microLayoutMaximumHeight: microLayoutMaxHeight,
  edgeGap: edgeGapPx,
  edgeAnchorThreshold: edgeAnchorThresholdPx
});
const getShellContentBounds = (bounds: Electron.Rectangle) => shellWindowPresentationSizing.getContentBounds(bounds);
const getShellContentWorkArea = (workArea: Electron.Rectangle) => shellWindowPresentationSizing.getContentWorkArea(workArea);
const getShellOuterMinimumSize = (size: { width: number; height: number }) => shellWindowPresentationSizing.getOuterMinimumSize(size);

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

const embeddedMetadataPreviewCoordinator = createEmbeddedMetadataPreviewCoordinator({ getActiveData: () => activePreviewData, publish: (update) => { if (activePreviewData) activePreviewData = { ...activePreviewData, embeddedMetadata: update.embeddedMetadata }; previewWindow?.webContents.send("preview:embeddedMetadata", update); } });

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
  capsuleWindowController.hide();
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
  isAlwaysOnTop: previewDockedShell.isFixed(),
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
const closePreviewSession = ({ restoreMain = true }: { restoreMain?: boolean } = {}) => {
  previewOpenRequestId += 1;
  embeddedMetadataPreviewCoordinator.cancel();
  closeFontPreviewSession();
  closeEpubPreviewSession();
  closeMobiPreviewSession();
  closeArchivePreviewSession();
  closeOfficePreviewSession();
  closePdfPreviewSession();
  if (activeSkimFolderStatsTask) {
    activeSkimFolderStatsTask.cancelled = true;
    activeSkimFolderStatsTask = null;
  }
  latestSkimFolderStatsUpdate = null;
  clearPreviewMoveSnapCheck();
  previewDockedShell.resetSession();
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
    if (wasActive && restoreMain) {
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
    ? previewDockedShell.getExpandedBounds(previewWindow)
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
  const currentBounds = previewDockedShell.getExpandedBounds(previewWindow);
  if (
    currentBounds.x !== nextBounds.x
    || currentBounds.y !== nextBounds.y
    || currentBounds.width !== nextBounds.width
    || currentBounds.height !== nextBounds.height
  ) {
    previewDockedShell.applyExpandedBounds(previewWindow, nextBounds, markPreviewProgrammaticMove);
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
      contextIsolation: true, devTools: !app.isPackaged, nodeIntegration: false
    }
  });
  lockWebContentsZoom(previewWindow.webContents);
  previewWindow.setSkipTaskbar(true);
  previewWindow.setMenuBarVisibility(false);
  previewDockedShell.attach({
    window: previewWindow,
    enabled: edgeCollapseEnabled,
    isSessionActive: () => previewSessionActive,
    isInteractionBlocked: () => isQuitting || isPreviewProgrammaticMoveGuardActive(),
    hideLine: () => lineWindowController.hide(),
    markProgrammaticMove: markPreviewProgrammaticMove,
    setCollapsedLayerActive: (active) => windowLayerController.setPreviewCollapsedLayerActive(active)
  });
  applyAlwaysOnTopState();
  previewWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  previewWindow.webContents.on("did-finish-load", () => {
    previewWindowLoaded = true;
    sendActivePreviewData();
    revealPreviewWindow();
  });
  previewWindow.on("focus", syncThumbnailOptimizationActivity);
  previewWindow.on("blur", syncThumbnailOptimizationActivity);
  previewWindow.on("show", syncThumbnailOptimizationActivity);
  previewWindow.on("hide", syncThumbnailOptimizationActivity);
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
    previewDockedShell.detach();
    previewWindow = null;
    previewWindowLoaded = false;
    previewSessionActive = false;
    activePreviewData = null;
    latestPreviewContentSize = null;
    syncThumbnailOptimizationActivity();
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
      contextIsolation: true, devTools: !app.isPackaged,
      nodeIntegration: false, sandbox: true
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

const getLineWindowPlacement = (currentBounds?: Electron.Rectangle, currentEdge?: WindowDockEdge) => {
  const placement = windowLayoutManager.resolveStandbyLinePlacement(toWindowLayoutDisplaySnapshot(getShellDisplay()));
  const vertical = placement.edge === "left" || placement.edge === "right";
  const previousVertical = currentEdge === "left" || currentEdge === "right";
  const interactionThickness = currentBounds && currentEdge && vertical === previousVertical
    ? vertical ? currentBounds.width : currentBounds.height
    : standbyInteractionThicknessPx;
  return {
    edge: placement.edge,
    bounds: getDirectionalLineBounds(placement.display.workArea, placement.edge, standbyVisualLengthPx, interactionThickness, edgeGapPx)
  };
};

const shouldShowLineWindow = () => (
  standbyLineVisible
  && Boolean(mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible())
  && !Boolean(previewWindow && !previewWindow.isDestroyed() && previewWindow.isVisible())
  && !capsuleWindowController.isVisible()
);

const lineWindowController = new LineWindowController({
  devServerUrl: process.env.VITE_DEV_SERVER_URL, devToolsEnabled: !app.isPackaged,
  getAlwaysOnTop: () => shellAlwaysOnTop,
  getPlacement: getLineWindowPlacement,
  interactionThickness: standbyInteractionThicknessPx,
  isQuitting: () => isQuitting,
  lockWebContentsZoom,
  preloadPath: path.join(__dirname, "preload.js"),
  rendererPath: path.join(__dirname, "../dist/index.html"),
  shouldShow: shouldShowLineWindow
});
const capsuleWindowController = new CapsuleWindowController({
  devServerUrl: process.env.VITE_DEV_SERVER_URL, devToolsEnabled: !app.isPackaged,
  getAlwaysOnTop: () => shellAlwaysOnTop, getMainWindow: () => mainWindow,
  getMode: () => windowPresentationRuntime.mode, isCapsuleActive: () => activeShellState === "capsule",
  isMainSender: (id) => Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.id === id),
  isQuitting: () => isQuitting, lockWebContentsZoom,
  markMainMove: () => markProgrammaticMove(), markMainResize: () => markProgrammaticResize(),
  onCancel: (clearQuery) => mainWindow?.webContents.send("capsule:cancelRequested", clearQuery),
  onDraftChange: (query) => mainWindow?.webContents.send("capsule:draftChanged", query),
  onSubmit: (query) => mainWindow?.webContents.send("capsule:submitRequested", query),
  preloadPath: path.join(__dirname, "preload.js"), registrar: ipcMain, rendererPath: path.join(__dirname, "../dist/index.html"),
  resolveCap7CEBounds: (display, edge) => getShellWindowBounds("capsule", display, edge),
  resolveCompatibilityBounds: (display, edge) => getDefaultShellLayoutBounds("capsule", display.workArea, { capsuleWidth: capsuleWidthPx, capsuleHeight: capsuleWindowHeightPx, capsuleEdge: edge, microHeight: microDefaultHeightPx, miniHeight: miniDefaultHeightPx, edgeGap: edgeGapPx })
});
const windowLayerController = new WindowLayerController({
  applyLineLayer: () => lineWindowController.applyAlwaysOnTop(),
  getMainFixed: () => shellAlwaysOnTop,
  getMainWindow: () => mainWindow,
  getPreviewFixed: () => previewDockedShell.isFixed(),
  getPreviewWindow: () => previewWindow,
  isPreviewActive: () => previewSessionActive
});
const applyAlwaysOnTopState = () => {
  const state = windowLayerController.apply();
  capsuleWindowController.applyAlwaysOnTop();
  return state;
};
const compatibilityNativeMaximizeController = new CompatibilityNativeMaximizeController({
  isCompatibilityMode: () => windowPresentationRuntime.mode === "compatibility",
  getShellState: () => activeShellState,
  enterNormalMaximized: () => {
    shellMaximized = false;
    microBottomCenterAnchored = false;
    activeShellState = "normal";
    syncTaskbarVisibility(activeShellState);
    sendShellStateToRenderer(activeShellState);
  },
  restoreShellState: (restore) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const minimumSize = getShellMinimumSize(restore.state);
    resetDockedShellPosition();
    if (minimumSize) mainWindow.setMinimumSize(minimumSize.width, minimumSize.height);
    mainWindow.setResizable(true);
    mainWindow.setHasShadow(true);
    markProgrammaticResize();
    markProgrammaticMove();
    mainWindow.setBounds(restore.bounds, true);
    activeShellState = restore.state;
    microBottomCenterAnchored = restore.state === "micro" && isBottomCenterMicroBounds(restore.bounds);
    syncTaskbarVisibility(activeShellState);
    rememberUserMovedShellBounds(restore.bounds);
    applyAlwaysOnTopState();
    sendShellStateToRenderer(activeShellState);
  }
});

const getNormalWorkAreaBounds = (): Electron.Rectangle => {
  const { x, y, width, height } = getShellDisplay().workArea;
  return { x, y, width, height };
};

const getShellWindowBounds = (state: Cap7CEShellState, targetDisplay?: Electron.Display, capsuleEdge: "top" | "bottom" = "bottom"): Electron.Rectangle => {
  const display = targetDisplay ?? (mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()) : screen.getPrimaryDisplay());
  return shellWindowPresentationSizing.resolveBounds({
    state,
    capsuleEdge,
    currentDisplay: toWindowLayoutDisplaySnapshot(display),
    displays: screen.getAllDisplays().map(toWindowLayoutDisplaySnapshot),
    layoutManager: windowLayoutManager
  });
};

const scheduleShellWorkAreaRefresh = (changedDisplayId: number | null) => {
  dockedShellController?.reconcileDisplayConfiguration();
  previewDockedShell.reconcileDisplayConfiguration();
  if (changedDisplayId === null || lineWindowController.isVisibleOnDisplay(changedDisplayId)) {
    lineWindowController.position();
  }
  capsuleWindowController.reconcileDisplayConfiguration(changedDisplayId);
};

const getMicroResizeBoundsForCurrentPosition = (currentBounds: Electron.Rectangle): Electron.Rectangle => {
  const { workArea } = screen.getDisplayMatching(currentBounds);
  return shellWindowPresentationSizing.getMicroResizeBounds(currentBounds, workArea);
};

const isBottomCenterMicroBounds = (bounds: Electron.Rectangle) => {
  const { workArea } = screen.getDisplayMatching(bounds);
  return shellWindowPresentationSizing.isBottomCenterBounds(bounds, workArea);
};

const getBottomCenterMicroResizeBounds = (newBounds: Electron.Rectangle): Electron.Rectangle => {
  const { workArea } = screen.getDisplayMatching(newBounds);
  return shellWindowPresentationSizing.getBottomCenterMicroResizeBounds(newBounds, workArea);
};

const getShellMinimumSize = (state: Cap7CEShellState) => {
  const workArea = mainWindow
    ? screen.getDisplayMatching(mainWindow.getBounds()).workArea
    : screen.getPrimaryDisplay().workArea;
  return shellWindowPresentationSizing.getMinimumSize(state, workArea);
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

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const canSnapShellWindow = () => (
  activeShellState === "micro" ||
  activeShellState === "mini" ||
  activeShellState === "normal" ||
  activeShellState === "settings"
);

const rememberUserMovedShellBounds = (bounds: Electron.Rectangle) => {
  const shellState = activeShellState;
  if (
    (shellState !== "micro" && shellState !== "mini" && shellState !== "normal" && shellState !== "settings")
    || shellMaximized
    || mainWindow?.isMaximized()
  ) {
    return;
  }
  const state: PersistedWindowLayoutState = shellState === "settings" ? "normal" : shellState;
  const display = screen.getDisplayMatching(bounds);
  if (!isStableResizeBounds(shellState, getShellContentBounds(bounds), getShellContentWorkArea(display.workArea))) return;
  windowLayoutManager.captureBounds({ state, bounds, display: toWindowLayoutDisplaySnapshot(display) });
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
    || previewDockedShell.hasActiveSession()
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
    || previewDockedShell.hasActiveSession()
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

const sendToggleSkimLocationPickerToRenderer = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:toggleSkimLocationPickerRequested");
  }
};

const sendActivateSkimToRenderer = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:activateSkimRequested");
  }
};

const sendActivateCapsuleShortcutToRenderer = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:activateCapsuleShortcut");
  }
};

const sendActivateShellModeShortcutToRenderer = (mode: "capsule" | "micro" | "mini" | "normal" | "standby") => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:activateShellModeShortcut", mode);
    return true;
  }
  return false;
};

const requestSafeMainWindowHide = () => sendActivateShellModeShortcutToRenderer("standby");

const sendEdgeCollapseEnabledToRenderer = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("preferences:edgeCollapseEnabledChanged", edgeCollapseEnabled);
  }
};

const showAndFocusMainWindow = () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  const shouldWaitForTargetLayout = !mainWindow.isVisible() && (
    activeShellState === "standby"
    || (activeShellState === "capsule" && windowPresentationRuntime.mode === "compatibility")
  );
  lineWindowController.hide();
  capsuleWindowController.hide();
  setShellIgnoreMouseEvents(false);
  if (shouldWaitForTargetLayout) {
    prepareHiddenActivationReveal();
  }
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

const activateCapsuleShortcut = (source: "cursor" | "line" = "cursor") => {
  const linePlacement = source === "line" ? getLineWindowPlacement() : null;
  capsuleWindowController.prepareTarget(linePlacement);
  if (windowPresentationRuntime.mode === "compatibility" && activeShellState === "capsule") {
    return applyCapsuleWindowMode();
  }
  if (windowPresentationRuntime.mode === "compatibility") {
    return sendActivateShellModeShortcutToRenderer("capsule");
  }
  if (!showAndFocusMainWindow()) {
    capsuleWindowController.clearPendingTarget();
    return false;
  }
  sendActivateShellModeShortcutToRenderer("capsule");
  sendActivateCapsuleShortcutToRenderer();
  return true;
};

const sendStandbyLineVisibleToRenderer = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("preferences:standbyLineVisibleChanged", standbyLineVisible);
  }
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

const activateShellModeShortcut = async (mode: "micro" | "mini" | "normal" | "standby" | "skim" | "settings"): Promise<boolean> => {
  if (mode === "settings") {
    return openSettingsFromTray();
  }

  if (mode === "skim") {
    if (!showAndFocusMainWindow()) return false;
    sendActivateSkimToRenderer();
    return true;
  }
  if (mode === "standby") {
    return requestSafeMainWindowHide();
  }
  if (!showAndFocusMainWindow()) return false;
  sendActivateShellModeShortcutToRenderer(mode);
  return true;
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
      label: edgeCollapseEnabled ? t("tray.disableEdgeCollapse") : t("tray.enableEdgeCollapse"),
      click: () => {
        void setEdgeCollapseEnabled(!edgeCollapseEnabled);
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

const showSystemNotification = (title: string, content: string, options: { force?: boolean } = {}) => {
  if ((!systemNotificationsEnabled && !options.force) || process.platform !== "win32" || !appTray) {
    return false;
  }
  try {
    appTray.displayBalloon({
      iconType: "custom",
      icon: path.join(app.getAppPath(), "build", "notification-icon.png"),
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
  appTray.on("click", () => void activateShellModeShortcut("normal"));
  appTray.on("balloon-click", () => openSettingsFromTray());
  updateTrayMenu();
};

const setStandbyLineVisible = async (nextStandbyLineVisible: boolean) => {
  standbyLineVisible = nextStandbyLineVisible;
  const preferences = await updateStandbyLineVisiblePreference(nextStandbyLineVisible);
  standbyLineVisible = preferences.standbyLineVisible;
  updateTrayMenu();
  sendStandbyLineVisibleToRenderer();

  if (standbyLineVisible) {
    lineWindowController.create();
    lineWindowController.show();
  } else {
    lineWindowController.destroy();
  }

  return preferences;
};

const setEdgeCollapseEnabled = async (enabled: boolean) => {
  const preferences = await updateEdgeCollapsePreference(enabled);
  edgeCollapseEnabled = preferences.edgeCollapseEnabled;
  dockedShellController?.setEnabled(edgeCollapseEnabled);
  previewDockedShell.setEnabled(edgeCollapseEnabled);
  updateTrayMenu();
  sendEdgeCollapseEnabledToRenderer();
  return preferences;
};

const openSettingsFromTray = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  if (!showAndFocusMainWindow()) {
    return false;
  }
  const preserveBounds = activeShellState === "normal" || activeShellState === "settings";
  if (activeShellState !== "settings") {
    applyShellWindowState("settings", { preserveBounds });
  }
  showAndFocusMainWindow();
  sendShellStateToRenderer("settings");
  sendOpenSettingsToRenderer();
  return true;
};

const getBoundsDebugPayload = (shellState: Extract<Cap7CEShellState, "capsule">) => {
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
      currentEntryPath: "applyCapsuleWindowMode",
      expectedRules: "false only when cursor is inside the current capsule window bounds; true with forward elsewhere",
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
  shellState: Extract<Cap7CEShellState, "capsule">
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
      path: activeShellState === "capsule"
        ? "adaptive global cursor polling"
        : "normal window mode"
    });
  }
};

const syncShellMousePassthrough = () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }

  if (activeShellState !== "capsule") {
    setShellIgnoreMouseEvents(false);
    return null;
  }

  const cursorPoint = screen.getCursorScreenPoint();
  const windowBounds = mainWindow.getBounds();
  const interactiveBounds = windowBounds;
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

const clearHiddenActivationReveal = () => {
  hiddenActivationRevealPending = false;
  if (hiddenActivationRevealTimer !== null) {
    clearTimeout(hiddenActivationRevealTimer);
    hiddenActivationRevealTimer = null;
  }
};

const revealMainWindowAfterHiddenActivation = () => {
  if (!hiddenActivationRevealPending || !mainWindow || mainWindow.isDestroyed()) {
    return false;
  }
  if (!mainWindow.isVisible()) {
    return false;
  }

  clearHiddenActivationReveal();
  mainWindow.setOpacity(1);
  applyAlwaysOnTopState();
  mainWindow.focus();
  mainWindow.moveTop();
  return true;
};

const prepareHiddenActivationReveal = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  clearHiddenActivationReveal();
  hiddenActivationRevealPending = true;
  mainWindow.setOpacity(0);
  hiddenActivationRevealTimer = setTimeout(() => {
    hiddenActivationRevealTimer = null;
    revealMainWindowAfterHiddenActivation();
  }, 800);
};

const sendAlwaysOnTopStateToRenderer = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:alwaysOnTopChanged", shellAlwaysOnTop);
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

const resetDockedShellPosition = () => { dockedShellController?.reset(false); };

const applyStandaloneLineMode = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  capsuleWindowController.hide();
  clearHiddenActivationReveal();
  resetDockedShellPosition();
  rememberUserMovedShellBounds(mainWindow.getBounds());
  mainWindow.setOpacity(1);
  stopShellMousePassthrough();
  setShellIgnoreMouseEvents(false);
  activeShellState = "standby";
  syncTaskbarVisibility(activeShellState);
  mainWindow.hide();
  if (standbyLineVisible) {
    lineWindowController.show();
  } else {
    lineWindowController.hide();
  }
  updateTrayMenu();
  return true;
};

const applyCapsuleWindowMode = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  lineWindowController.hide();
  resetShellBehavior();
  resetDockedShellPosition();
  if (mainWindow.isMaximized()) {
    compatibilityNativeMaximizeController.cancelRestore();
    mainWindow.unmaximize();
  }

  const { display: targetDisplay, edge: capsuleEdge } = capsuleWindowController.takeTarget();
  if (windowPresentationRuntime.mode === "compatibility") {
    if (previewSessionActive) closePreviewSession({ restoreMain: false });
    clearHiddenActivationReveal();
    mainWindow.setOpacity(1);
    stopShellMousePassthrough();
    setShellIgnoreMouseEvents(false);
    activeShellState = "capsule";
    syncTaskbarVisibility(activeShellState);
    mainWindow.hide();
    const bounds = getDefaultShellLayoutBounds("capsule", targetDisplay.workArea, { capsuleWidth: capsuleWidthPx, capsuleHeight: capsuleWindowHeightPx, capsuleEdge, microHeight: microDefaultHeightPx, miniHeight: miniDefaultHeightPx, edgeGap: edgeGapPx });
    capsuleWindowController.show(bounds);
    updateTrayMenu();
    return true;
  }

  logWindowBoundsDebug("[capsule before]", "capsule");
  const capsuleBounds = getShellWindowBounds("capsule", targetDisplay, capsuleEdge);
  markProgrammaticResize();
  markProgrammaticMove();
  mainWindow.setMinimumSize(1, 1);
  mainWindow.setHasShadow(false);
  mainWindow.setResizable(false);
  setShellIgnoreMouseEvents(false);
  mainWindow.setBounds(capsuleBounds, false);
  mainWindow.setContentSize(capsuleBounds.width, capsuleBounds.height, false);
  const actualCapsuleBounds = mainWindow.getBounds();
  if (actualCapsuleBounds.height !== capsuleBounds.height) {
    const { workArea } = screen.getDisplayMatching(actualCapsuleBounds);
    const correctedBounds = getDefaultShellLayoutBounds("capsule", workArea, { capsuleWidth: actualCapsuleBounds.width, capsuleHeight: actualCapsuleBounds.height, capsuleEdge, microHeight: microDefaultHeightPx, miniHeight: miniDefaultHeightPx, edgeGap: edgeGapPx });
    markProgrammaticMove();
    mainWindow.setBounds(correctedBounds, false);
  }
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
    return applyStandaloneLineMode();
  }
  if (state === "capsule") {
    return applyCapsuleWindowMode();
  }
  const leavingCompatibilityCapsule = activeShellState === "capsule" && windowPresentationRuntime.mode === "compatibility";
  capsuleWindowController.hide();
  lineWindowController.hide();
  microBottomCenterAnchored = false;
  resetDockedShellPosition();

  const isLargeWindow = state === "normal" || state === "settings";
  const isResizableWindow = state === "micro" || state === "mini" || isLargeWindow;
  const minimumSize = getShellMinimumSize(state);
  const preserveBounds = Boolean(options.preserveBounds);
  if (!isLargeWindow) {
    shellMaximized = false;
  }
  if (mainWindow.isMaximized() && !preserveBounds) {
    compatibilityNativeMaximizeController.cancelRestore();
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
  if (leavingCompatibilityCapsule) showAndFocusMainWindow();
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
  const nextBounds = keepDefaultBottomGap ? transitionBounds : getEdgeSnappedBounds(transitionBounds);
  const isResizableWindow = targetState === "micro" || targetState === "mini" || targetState === "normal";

  resetDockedShellPosition();

  if (mainWindow.isMaximized()) {
    compatibilityNativeMaximizeController.cancelRestore();
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
  },
  {
    scheme: "cap7cefont",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

const registerLocalImageProtocol = () => {
  const toResponseBody = (buffer: Buffer) => (
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  );

  protocol.handle("cap7cefont", async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "preview") return new Response("Not found", { status: 404 });
    const filePath = url.searchParams.get("path");
    const sessionId = url.searchParams.get("session");
    if (!filePath) return new Response("Missing path", { status: 400 });
    try {
      const normalizedRequestedPath = path.normalize(path.resolve(filePath));
      if (!isFontPreviewRequestAuthorized(activePreviewData, sessionId, normalizedRequestedPath)) {
        return new Response("Font preview is unavailable", { status: 403 });
      }
      const { normalizedPath, size } = await inspectFontPreviewSource(normalizedRequestedPath);
      const extension = path.extname(normalizedPath).toLowerCase();
      const body = request.method === "HEAD"
        ? null
        : Readable.toWeb(createReadStream(normalizedPath)) as ReadableStream<Uint8Array>;
      return new Response(body, {
        headers: {
          "Content-Length": String(size),
          "Content-Type": extension === ".otf" ? "font/otf" : "font/ttf",
          "Cache-Control": "no-store"
        }
      });
    } catch {
      return new Response("Font preview is unavailable", { status: 404 });
    }
  });

  protocol.handle("cap7ce", async (request) => {
    const url = new URL(request.url);
    if (
      url.hostname !== "thumbnail"
      && url.hostname !== "image"
      && url.hostname !== "search-shell-thumbnail"
      && url.hostname !== "search-shell-preview"
      && url.hostname !== "skim-image"
      && url.hostname !== "skim-thumbnail"
      && url.hostname !== "skim-preview"
      && url.hostname !== "skim-media"
      && url.hostname !== "pdf-page"
    ) {
      return new Response("Not found", { status: 404 });
    }

    const filePath = url.searchParams.get("path");
    if (!filePath) {
      return new Response("Missing path", { status: 400 });
    }

    try {
      if (url.hostname === "pdf-page") {
        const sessionId = url.searchParams.get("session");
        const pageNumber = Number(url.searchParams.get("page"));
        const normalizedRequestedPath = path.normalize(path.resolve(filePath));
        const normalizedActivePath = activePreviewData
          ? path.normalize(path.resolve(activePreviewData.filePath))
          : "";
        const samePath = process.platform === "win32"
          ? normalizedRequestedPath.toLowerCase() === normalizedActivePath.toLowerCase()
          : normalizedRequestedPath === normalizedActivePath;
        if (
          !sessionId
          || activePreviewData?.provider !== "pdf"
          || activePreviewData.sessionId !== sessionId
          || !samePath
          || !Number.isInteger(pageNumber)
        ) {
          return new Response("PDF preview page is unavailable", { status: 403 });
        }
        const page = await renderPdfPreviewPage(sessionId, normalizedRequestedPath, pageNumber);
        return new Response(toResponseBody(page), {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "no-store"
          }
        });
      }
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
        if (!sessionId || (url.hostname === "skim-preview" && !capability?.canThumbnail && !capability?.canShellPreview)) {
          return new Response("Skim visual request is unavailable", { status: 415 });
        }
        const cachePath = url.hostname === "skim-preview" && capability?.canShellPreview
          ? await requestSkimShellPreviewCache(sessionId, filePath)
          : url.hostname === "skim-thumbnail" && !capability?.canThumbnail
            ? await requestSkimShellThumbnailCache(sessionId, filePath)
            : await requestSkimVisualCache(
            sessionId,
            filePath,
            url.hostname === "skim-preview" ? "preview" : "thumbnail"
            );
        if (url.hostname === "skim-preview" && await shouldUseSourceFileForPreview(filePath)) {
          return net.fetch(pathToFileURL(filePath).toString());
        }
        const image = await readVisualCacheImage(cachePath);
        return new Response(toResponseBody(image.buffer), {
          headers: {
            "Content-Type": image.mimeType,
            "Cache-Control": "no-store"
          }
        });
      }
      if (url.hostname === "search-shell-thumbnail" || url.hostname === "search-shell-preview") {
        const capability = getFileFormatCapability(path.extname(filePath).toLowerCase());
        const available = url.hostname === "search-shell-preview"
          ? capability?.canShellPreview
          : capability && canUseSearchShellThumbnail(capability.extension);
        if (!available) {
          return new Response("Search system image is unavailable", { status: 415 });
        }
        const cachePath = url.hostname === "search-shell-preview"
          ? await requestSearchShellPreviewCache(filePath)
          : await requestSearchShellThumbnailCache(filePath);
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

      const thumbnailPath = await ensureThumbnailPath(
        filePath,
        "interactive",
        url.searchParams.get("sourceRevision") ?? ""
      );
      const thumbnail = await readVisualCacheImage(thumbnailPath);
      return new Response(toResponseBody(thumbnail.buffer), {
        headers: {
          "Content-Type": thumbnail.mimeType,
          "Cache-Control": "no-store"
        }
      });
    } catch (error) {
      return createThumbnailFailureResponse(filePath, error, runtimeDiagnostics);
    }
  });
};

const evaluateShellResizeThresholds = () => {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized() || isProgrammaticResizeGuardActive() || dockedShellController?.hasActiveSession()) {
    return;
  }

  if (activeShellState !== "micro" && activeShellState !== "mini" && activeShellState !== "normal" && activeShellState !== "settings") {
    return;
  }

  const currentBounds = mainWindow.getBounds();
  const currentDisplay = screen.getDisplayMatching(currentBounds);
  const nextState = resolveResizeTargetState(activeShellState, getShellContentBounds(currentBounds), getShellContentWorkArea(currentDisplay.workArea));
  if (activeShellState === "settings") {
    if (nextState !== "normal") {
      shellMaximized = false;
      setShellWindowStateFromResize(nextState);
    } else {
      rememberUserMovedShellBounds(currentBounds);
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
    rememberUserMovedShellBounds(nextBounds);
    return;
  }
  if (!setShellWindowStateFromResize(nextState)) rememberUserMovedShellBounds(currentBounds);
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
  if (!mainWindow || mainWindow.isDestroyed() || shellMaximized || mainWindow.isMaximized() || dockedShellController?.hasActiveSession() || !canSnapShellWindow()) {
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
  if (!isHorizontalResize || getShellContentBounds(newBounds).height >= microLayoutMaxHeight) {
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

  const leavingCompatibilityCapsule = activeShellState === "capsule" && windowPresentationRuntime.mode === "compatibility";
  capsuleWindowController.hide();
  lineWindowController.hide();
  const defaultMicroBounds = getShellWindowBounds("micro");
  clearResizeSettledCheck();
  const minimumSize = getShellMinimumSize("micro");

  shellMaximized = false;
  lastNormalBounds = null;
  resetDockedShellPosition();
  if (mainWindow.isMaximized()) {
    compatibilityNativeMaximizeController.cancelRestore();
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
  microBottomCenterAnchored = isBottomCenterMicroBounds(defaultMicroBounds);
  applyAlwaysOnTopState();
  if (leavingCompatibilityCapsule) showAndFocusMainWindow();

  return true;
};

const getMainWindowPresentationOptions = () => windowPresentationRuntime.getBrowserOptions("main", nativeTheme.shouldUseDarkColors);

const refreshMainWindowPresentationAppearance = async () => {
  const preferences = await getUserPreferences();
  return windowPresentationRuntime.applyMainWindowAppearance(mainWindow, preferences.themePreference, nativeTheme.shouldUseDarkColors);
};

const createWindow = () => {
  mainWindowReadyForActivation = false;
  const initialBounds = getShellWindowBounds("normal");
  const initialMinimumSize = getShellOuterMinimumSize({ width: resizableShellMinimumWidthPx, height: resizableShellMinimumHeightPx });
  mainWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: initialMinimumSize.width,
    minHeight: initialMinimumSize.height,
    title: "Cap7CE",
    skipTaskbar: false,
    ...getMainWindowPresentationOptions(),
    hasShadow: true,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, devTools: !app.isPackaged, nodeIntegration: false
    }
  });
  lockWebContentsZoom(mainWindow.webContents);
  mainWindow.webContents.once("did-finish-load", () => { void windowPresentationSwitchRuntime.completeStartup(windowPresentationRuntime.mode); });
  dockedShellController = installDockedShell({
    window: mainWindow, enabled: edgeCollapseEnabled, enableDebugShortcut: Boolean(process.env.VITE_DEV_SERVER_URL),
    fixed: shellAlwaysOnTop,
    getShellContext: () => ({ state: activeShellState, maximized: shellMaximized || Boolean(mainWindow?.isMaximized()), interactionBlocked: isQuitting || isProgrammaticMoveGuardActive() || isProgrammaticResizeGuardActive() }),
    hideLine: () => lineWindowController.hide(), markProgrammaticMove, markProgrammaticResize,
    setCollapsedLayerActive: (active) => windowLayerController.setMainCollapsedLayerActive(active)
  });
  mainWindowSkipTaskbar = false;

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindowReadyForActivation = true;
    if (activeShellState !== "standby") {
      applyShellWindowState("normal");
    }
    if (pendingSecondInstanceActivation) {
      pendingSecondInstanceActivation = false;
      void activateShellModeShortcut("normal");
    }
    syncThumbnailOptimizationActivity();
  });

  mainWindow.on("focus", syncThumbnailOptimizationActivity);
  mainWindow.on("blur", () => {
    syncThumbnailOptimizationActivity();
    cancelActiveSearchTasks();
    if (activeShellState === "capsule" && windowPresentationRuntime.mode === "cap7ce") {
      sendActivateShellModeShortcutToRenderer("standby");
    }
  });
  mainWindow.on("show", syncThumbnailOptimizationActivity);
  mainWindow.on("hide", () => {
    syncThumbnailOptimizationActivity();
    cancelActiveSearchTasks();
    discardQueuedInteractiveThumbnailRenders();
  });
  mainWindow.on("minimize", () => discardQueuedInteractiveThumbnailRenders());
  compatibilityNativeMaximizeController.attach(mainWindow);
  mainWindow.on("will-resize", applyBottomCenterMicroWillResize);

  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    requestSafeMainWindowHide();
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
    if (isProgrammaticMoveGuardActive() || dockedShellController?.hasActiveSession()) {
      return;
    }

    if (activeShellState === "micro") {
      microBottomCenterAnchored = false;
    }
    scheduleMoveSnapCheck();
  });
};

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    if (!mainWindowReadyForActivation) {
      pendingSecondInstanceActivation = true;
      return;
    }
    void activateShellModeShortcut("normal");
  });
}

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  await runtimeDiagnostics.initialize();
  const completedUpdateVersion = app.isPackaged
    ? await consumeAppUpdateCompletion({
      currentVersion: app.getVersion(),
      argumentVersion: completedUpdateVersionArgument,
      installMarkerPath: path.join(path.dirname(process.execPath), ".cap7ce-update-completed"),
      versionStatePath: path.join(app.getPath("userData"), "config", "app-version.json"),
      legacyUserDataPaths: [
        path.join(app.getPath("userData"), "config", "preferences.json"),
        getImageDatabasePath(),
        getLegacyImageDatabasePath()
      ]
    }).catch((error) => {
      console.warn("[app-update] failed to resolve completed update", error);
      return completedUpdateVersionArgument;
    })
    : completedUpdateVersionArgument;
  registerLocalImageProtocol();
  await prepareOfficePreviewTemporaryRoot().catch((error) => {
    console.warn("[office-preview] failed to reset temporary root", error);
  });
  await ensureImageDatabase();
  try {
    await backfillFilePathEvidence(await listDirectories());
  } catch (error) {
    console.warn("[search-path-evidence] failed to backfill existing catalog paths", error);
  }
  const preferences = await getUserPreferences();
  const requestedWindowPresentationMode = !app.isPackaged && process.env.CAP7CE_WINDOW_PRESENTATION_MODE ? process.env.CAP7CE_WINDOW_PRESENTATION_MODE : preferences.windowPresentationMode;
  windowPresentationRuntime.configure(await windowPresentationSwitchRuntime.resolveStartupMode(normalizeWindowPresentationMode(requestedWindowPresentationMode)), preferences.themePreference);
  windowLayoutManager = new WindowLayoutManager(new WindowLayoutStore(path.join(app.getPath("userData"), "config", windowPresentationRuntime.layoutFileName)));
  await windowLayoutManager.load();
  windowLayoutManager.setPreferences(preferences);
  setActiveLanguage(resolveLanguagePreference(preferences.languagePreference, app.getLocale()));
  edgeCollapseEnabled = preferences.edgeCollapseEnabled;
  shellAlwaysOnTop = preferences.alwaysOnTop;
  standbyLineVisible = preferences.standbyLineVisible;
  systemNotificationsEnabled = preferences.systemNotificationsEnabled;
  quickActionGlobalEnabled = preferences.quickActionGlobalEnabled;
  applyLaunchAtLoginPreference(preferences.launchAtLogin);
  setThumbnailOptimizationSort(preferences.sortPreference.sortField, preferences.sortPreference.sortDirection);
  await setThumbnailOptimizationEnabled(preferences.autoCacheOptimizationEnabled);
  createWindow();
  nativeTheme.on("updated", () => { if (windowPresentationRuntime.usesSystemTheme) void refreshMainWindowPresentationAppearance(); });
  if (standbyLineVisible) {
    lineWindowController.create();
  }
  screen.on("display-metrics-changed", (_event, display, changedMetrics) => {
    if (!changedMetrics.includes("workArea") && !changedMetrics.includes("bounds") && !changedMetrics.includes("scaleFactor")) return;
    scheduleShellWorkAreaRefresh(display.id);
  });
  screen.on("display-added", () => scheduleShellWorkAreaRefresh(null));
  screen.on("display-removed", () => scheduleShellWorkAreaRefresh(null));
  setThumbnailOptimizationStatusListener((status) => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send("cache:optimizationStatusChanged", status);
    }
    handleThumbnailOptimizationStatusForNotification(status);
  });
  configureEmbeddedMetadataRuntime(ipcMain, () => mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null);
  if (preferences.autoCacheOptimizationEnabled) {
    scheduleDirectoryThumbnailOptimization(await listDirectories());
  }
  void createStartupHintWindow();
  createAppTray();
  if (completedUpdateVersion) {
    setTimeout(() => {
      showSystemNotification(
        t("notification.updateCompletedTitle"),
        t("notification.updateCompletedContent", { version: completedUpdateVersion }),
        { force: true }
      );
    }, 7_000);
  }
  if (quickActionGlobalEnabled) {
    registerConfiguredGlobalShortcuts(preferences.shortcutActions);
  } else {
    probeGlobalShortcutActions(preferences.shortcutActions);
  }
  void showBackgroundRunNotificationOnce(preferences).catch((error) => {
    console.warn("[system-notification] failed to persist first-run state", error);
  });
  setTimeout(() => {
    void cleanupStaleAppUpdateLaunchers().catch((error) => {
      console.warn("[app-update] failed to clean stale launchers", error);
    });
    void cleanupStaleAppUpdateDownloads().catch((error) => {
      console.warn("[app-update] failed to clean stale downloads", error);
    });
  }, 30_000);

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
  void windowLayoutManager.flush().catch((error) => console.warn("[window-layout] final write failed", error));
  clearHiddenActivationReveal();
  capsuleWindowController.destroy();
  closeStartupHintWindow();
  clearPreviewIdleDestroyTimer();
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.destroy();
  }
  previewWindow = null;
  unregisterActivateCapsuleShortcut();
  unregisterShellModeShortcuts();
  dockedShellController?.dispose();
  appTray?.destroy();
  appTray = null;
});

ipcMain.handle("window:getShellLayoutMetrics", () => ({
  miniStandardHeight: miniDefaultHeightPx,
  titlebarHeight: getMainWindowTitlebarHeight(),
  windowPresentationMode: windowPresentationRuntime.mode
}));

ipcMain.handle("line:activateCapsule", (event) => {
  if (!lineWindowController.ownsWebContents(event.sender.id)) {
    return false;
  }
  return activateCapsuleShortcut("line");
});

ipcMain.handle("window:setShellState", (_event, state: string, options?: { forceBounds?: boolean; preserveBounds?: boolean }) => {
  const forceBounds = Boolean(options?.forceBounds);
  if (state === "micro" && forceBounds) {
    return forceApplyDefaultMicroBounds();
  }

  if (state === "standby") {
    return applyStandaloneLineMode();
  }
  if (state === "capsule") {
    return applyCapsuleWindowMode();
  }

  if (isShellWindowState(state) && state === activeShellState && !forceBounds) {
    dockedShellController?.restore(true);
    return true;
  }

  return applyShellWindowState(state, { preserveBounds: Boolean(options?.preserveBounds) });
});

ipcMain.handle("window:revealAfterShellStateReady", (event) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender.id !== mainWindow.webContents.id) {
    return false;
  }
  return revealMainWindowAfterHiddenActivation();
});

ipcMain.handle("window:setAlwaysOnTop", async (_event, enabled: boolean) => {
  if (!mainWindow) return { enabled: Boolean(enabled), actual: false, windowId: null };
  const requestedEnabled = Boolean(enabled);
  const before = mainWindow.isAlwaysOnTop();
  const preferences = await updateAlwaysOnTopPreference(requestedEnabled);
  shellAlwaysOnTop = preferences.alwaysOnTop;
  dockedShellController?.setFixed(shellAlwaysOnTop);
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
  if (!app.isPackaged) {
    return { status: "unsupported", version: pendingAppUpdateDownload.version };
  }
  if (appUpdateDownloadActive) {
    return { status: "busy", version: pendingAppUpdateDownload.version };
  }
  const update = pendingAppUpdateDownload;
  const updateSessionId = randomUUID();
  const updateRoot = path.join(app.getPath("temp"), `Cap7CE-update-${update.version}-${updateSessionId}`);
  const packagePath = path.join(updateRoot, `Cap7CE-${update.version}-win-x64.zip`);
  const helperPath = path.join(updateRoot, "update-helper.ps1");
  // Keep the executing launcher outside updateRoot so the helper can remove the download directory safely.
  const launcherPath = path.join(app.getPath("temp"), `Cap7CE-update-launcher-${updateSessionId}.vbs`);
  const failureLogPath = path.join(app.getPath("temp"), "Cap7CE-update-last-failure.log");
  const sendDownloadProgress = (progress: AppUpdateDownloadProgress) => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send("app:updateDownloadProgress", progress);
    }
  };
  appUpdateDownloadActive = true;
  appUpdateDownloadAbortController = new AbortController();
  try {
    void cleanupStaleAppUpdateDownloads().catch(() => undefined);
    await downloadAppUpdate(update, packagePath, sendDownloadProgress, fetch, undefined, appUpdateDownloadAbortController.signal);
    appUpdateDownloadAbortController = null;
    await fs.copyFile(path.join(app.getAppPath(), "build", "update-helper.ps1"), helperPath);
    const helperReadyPath = path.join(updateRoot, "helper-ready");
    const helperFailedPath = path.join(updateRoot, "helper-failed");
    await fs.rm(failureLogPath, { force: true }).catch(() => undefined);
    await fs.access(resolveWindowsPowerShellPath());
    await fs.writeFile(launcherPath, createAppUpdateLauncherScript({
      helperPath,
      packagePath,
      installDirectory: path.dirname(process.execPath),
      expectedVersion: update.version,
      currentProcessId: process.pid,
      executableName: path.basename(process.execPath)
    }), "utf8");
    const launchError = await shell.openPath(launcherPath);
    if (launchError) {
      throw new Error(`Update launcher could not be opened: ${launchError}`);
    }
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearInterval(readyPoll);
        clearTimeout(readyTimeout);
        if (error) reject(error);
        else resolve();
      };
      const checkReady = () => {
        void Promise.all([
          fs.access(helperReadyPath).then(() => true).catch(() => false),
          fs.readFile(helperFailedPath, "utf8").catch(() => "")
        ]).then(([ready, failure]) => {
          if (ready) finish();
          else if (failure) finish(new Error(`Update helper failed before it was ready: ${failure.trim()}`));
        });
      };
      const readyPoll = setInterval(checkReady, 100);
      const readyTimeout = setTimeout(() => {
        finish(new Error("Update helper did not become ready in time."));
      }, 300_000);
      checkReady();
    });
    pendingAppUpdateDownload = null;
    setTimeout(() => {
      isQuitting = true;
      app.quit();
    }, 500);
    return { status: "installing", version: update.version };
  } catch (error) {
    console.warn("[app-update] automatic update failed", error);
    const failureReason: AppUpdateDownloadErrorCode = error instanceof AppUpdateDownloadError
      ? error.code
      : error instanceof Error && /downloaded update package|expected Cap7CE layout|expand-archive|archive/i.test(error.message)
        ? "invalid"
        : ((error as NodeJS.ErrnoException)?.code === "ENOSPC" ? "disk_space" : "unknown");
    const helperLogPath = path.join(updateRoot, "update-helper.log");
    const helperLog = await fs.readFile(helperLogPath, "utf8").catch(() => "");
    const failureDetails = [
      `${new Date().toISOString()} Cap7CE ${app.getVersion()} update preparation failed.`,
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      helperLog.trim()
    ].filter(Boolean).join("\n");
    await fs.writeFile(failureLogPath, `${failureDetails}\n`, "utf8").catch(() => undefined);
    await writeAppUpdateDiagnostic(app.getPath("userData"), failureDetails).catch(() => undefined);
    await fs.rm(updateRoot, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(launcherPath, { force: true }).catch(() => undefined);
    return { status: failureReason === "cancelled" ? "cancelled" : "failed", version: update.version, reason: failureReason };
  } finally {
    appUpdateDownloadAbortController = null;
    appUpdateDownloadActive = false;
  }
});

ipcMain.handle("app:cancelUpdateDownload", (event) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || !appUpdateDownloadAbortController) {
    return false;
  }
  appUpdateDownloadAbortController?.abort();
  return true;
});

ipcMain.handle("preview:open", async (event, data: PreviewWindowData) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return false;
  }
  if (
    !data
    || typeof data.sessionId !== "string"
    || typeof data.filePath !== "string"
    || typeof data.fileSize !== "number"
    || !Number.isFinite(data.fileSize)
    || data.fileSize < 0
    || typeof data.modifiedAt !== "string" || typeof data.previewUrl !== "string"
    || (data.provider !== undefined
      && data.provider !== "image"
      && data.provider !== "fileInfo"
      && data.provider !== "folderInfo"
      && data.provider !== "text"
      && data.provider !== "audio"
      && data.provider !== "video"
      && data.provider !== "pdf"
      && data.provider !== "office"
      && data.provider !== "archive"
      && data.provider !== "font"
      && data.provider !== "epub"
      && data.provider !== "mobi")
    || (data.provider !== undefined && (!data.info || data.info.path !== data.filePath))
    || (data.provider === "text" && (!data.textPreview || typeof data.textPreview.content !== "string"))
    || data.archivePreview !== undefined
    || data.archiveFallbackReason !== undefined
    || data.fontPreview !== undefined
    || data.fontFallbackReason !== undefined
    || data.epubPreview !== undefined
    || data.epubFallbackReason !== undefined
    || data.mobiPreview !== undefined
    || data.mobiFallbackReason !== undefined
    || typeof data.skimActive !== "boolean"
    || (data.theme !== "light" && data.theme !== "dark")
  ) {
    return false;
  }
  const requestId = ++previewOpenRequestId;
  embeddedMetadataPreviewCoordinator.cancel();
  const previewMetadata = await readPreviewEmbeddedMetadata(data.filePath, { fileSize: data.fileSize, modifiedAt: data.modifiedAt }).catch(() => ({ metadata: null, isCurrent: false }));
  let preparedData: PreviewWindowData = {
    ...data, embeddedMetadata: previewMetadata.metadata ?? undefined,
    pdfPreview: undefined,
    archivePreview: undefined,
    archiveFallbackReason: undefined,
    fontPreview: undefined,
    fontFallbackReason: undefined,
    epubPreview: undefined,
    epubFallbackReason: undefined,
    mobiPreview: undefined,
    mobiFallbackReason: undefined
  };
  if (data.provider !== "mobi") closeMobiPreviewSession();
  if (data.provider !== "epub") closeEpubPreviewSession();
  if (data.provider === "mobi") {
    closeEpubPreviewSession();
    closeFontPreviewSession();
    closeArchivePreviewSession();
    closeOfficePreviewSession();
    closePdfPreviewSession();
    try {
      const mobiPreview = await openMobiPreviewSession(data.sessionId, data.filePath);
      if (requestId !== previewOpenRequestId) {
        closeMobiPreviewSession(data.sessionId);
        return false;
      }
      preparedData = { ...preparedData, mobiPreview };
    } catch (error) {
      if (requestId !== previewOpenRequestId) return false;
      preparedData = {
        ...preparedData,
        provider: "fileInfo",
        previewUrl: "",
        mobiFallbackReason: error instanceof MobiPreviewError ? error.reason : "failed"
      };
    }
  } else if (data.provider === "epub") {
    closeMobiPreviewSession();
    closeFontPreviewSession();
    closeArchivePreviewSession();
    closeOfficePreviewSession();
    closePdfPreviewSession();
    try {
      const epubPreview = await openEpubPreviewSession(data.sessionId, data.filePath);
      if (requestId !== previewOpenRequestId) {
        closeEpubPreviewSession(data.sessionId);
        return false;
      }
      preparedData = { ...preparedData, epubPreview };
    } catch (error) {
      if (requestId !== previewOpenRequestId) return false;
      preparedData = {
        ...preparedData,
        provider: "fileInfo",
        previewUrl: "",
        epubFallbackReason: error instanceof EpubPreviewError ? error.reason : "failed"
      };
    }
  } else if (data.provider === "font") {
    closeArchivePreviewSession();
    closeOfficePreviewSession();
    closePdfPreviewSession();
    try {
      const fontPreview = await openFontPreviewSession(data.sessionId, data.filePath, data.language);
      if (requestId !== previewOpenRequestId) {
        closeFontPreviewSession(data.sessionId);
        return false;
      }
      preparedData = { ...preparedData, fontPreview };
    } catch (error) {
      if (requestId !== previewOpenRequestId) return false;
      closeFontPreviewSession(data.sessionId);
      preparedData = {
        ...preparedData,
        provider: "fileInfo",
        previewUrl: "",
        fontFallbackReason: error instanceof FontPreviewError ? error.reason : "failed"
      };
    }
  } else if (data.provider === "archive") {
    closeFontPreviewSession();
    closeOfficePreviewSession();
    closePdfPreviewSession();
    try {
      const archivePreview = await openArchivePreviewSession(data.sessionId, data.filePath);
      if (requestId !== previewOpenRequestId) {
        closeArchivePreviewSession(data.sessionId);
        return false;
      }
      preparedData = { ...preparedData, archivePreview };
    } catch (error) {
      if (requestId !== previewOpenRequestId) return false;
      closeArchivePreviewSession(data.sessionId);
      preparedData = {
        ...preparedData,
        provider: "fileInfo",
        previewUrl: "",
        archiveFallbackReason: error instanceof ArchivePreviewError ? error.reason : "failed"
      };
    }
  } else if (data.provider === "pdf" || data.provider === "office") {
    closeFontPreviewSession();
    closeArchivePreviewSession();
    try {
      let pdfSourcePath = data.filePath;
      if (data.provider === "office") {
        const officePreview = await openOfficePreviewSession(data.sessionId, data.filePath);
        if (requestId !== previewOpenRequestId) {
          closeOfficePreviewSession(data.sessionId);
          return false;
        }
        pdfSourcePath = officePreview.pdfPath;
      } else {
        closeOfficePreviewSession();
      }
      const pdfPreview = await openPdfPreviewSession(data.sessionId, pdfSourcePath, data.filePath);
      if (requestId !== previewOpenRequestId) {
        closeOfficePreviewSession(data.sessionId);
        closePdfPreviewSession(data.sessionId);
        return false;
      }
      preparedData = { ...preparedData, provider: "pdf", pdfPreview };
    } catch {
      if (requestId !== previewOpenRequestId) return false;
      closeOfficePreviewSession(data.sessionId);
      closePdfPreviewSession(data.sessionId);
      preparedData = {
        ...preparedData,
        provider: "fileInfo",
        previewUrl: "",
        pdfPreview: undefined
      };
    }
  } else {
    closeMobiPreviewSession();
    closeEpubPreviewSession();
    closeFontPreviewSession();
    closeArchivePreviewSession();
    closeOfficePreviewSession();
    closePdfPreviewSession();
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
  previewDockedShell.startSession();
  activePreviewData = preparedData;
  latestPreviewContentSize = null;
  sendActivePreviewData();
  embeddedMetadataPreviewCoordinator.start(preparedData, !previewMetadata.isCurrent);
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
  previewDockedShell.toggleFixed();
  applyAlwaysOnTopState();
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

ipcMain.handle("preview:toggleSkimLocationPicker", (event) => {
  if (!previewWindow || previewWindow.isDestroyed() || event.sender !== previewWindow.webContents) {
    return false;
  }
  closePreviewSession();
  sendToggleSkimLocationPickerToRenderer();
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

const isFileClipboardSenderAllowed = (event: IpcMainInvokeEvent) => Boolean(
  (
    mainWindow
    && !mainWindow.isDestroyed()
    && event.sender === mainWindow.webContents
  ) || (
    previewWindow
    && !previewWindow.isDestroyed()
    && event.sender === previewWindow.webContents
  )
);

registerFileIpc({
  registrar: ipcMain,
  isPackaged: app.isPackaged,
  isClipboardSenderAllowed: isFileClipboardSenderAllowed,
  openPath: (filePath) => shell.openPath(filePath),
  showItemInFolder: (filePath) => shell.showItemInFolder(filePath),
  normalizeClipboardPaths: normalizeFilePathsForClipboard,
  writeClipboardText: (text) => clipboard.writeText(text),
  copyFileItems: copyFileItemsToClipboard,
  moveFilesToTrash: moveIndexedImagesToTrash,
  startFileDrag: (sender, filePaths) => dockedShellController ? dockedShellController.runSuppressed(() => startNativeFileDrag(sender, filePaths)) : startNativeFileDrag(sender, filePaths),
  translateFileDeleteServiceFailure: () => t("error.fileDeleteServiceFailed"),
  translateFileDragStartFailure: () => t("error.fileDragStartFailed")
});

const withSqliteImageCounts = async (directories: PersistedDirectory[]) => {
  const directoryIds = directories.map((directory) => directory.id);
  const counts = await getExistingImageCountsByDirectory(directoryIds);
  return directories.map((directory) => ({
    ...directory,
    indexedCount: (counts[directory.id] ?? 0) > 0 ? counts[directory.id] : directory.indexedCount
  }));
};

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
    scheduleDirectoryThumbnailOptimization(result.added);
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

registerDirectoryManagementIpc({
  registrar: ipcMain,
  listDirectories,
  updateDirectoryName,
  decorateDirectories: withSqliteImageCounts,
  selectDirectoryCandidates: async () => {
    const options: OpenDialogOptions = {
      title: t("dialog.selectIndexDirectory"),
      properties: ["openDirectory", "multiSelections"]
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths;
  },
  createCancelledDirectoryAddResult,
  addDirectoryCandidates: addDirectoryCandidatesWithIndexMigration,
  scanDirectories: scanImageDirectories,
  seedScanSnapshot: (directories, scanResult) => searchScanSnapshotService.seed(directories, scanResult),
  writeScannedFiles: writeScannedFilesWithEmbeddedMetadata,
  applyDirectoryFileCounts,
  pauseThumbnailOptimization,
  pauseThumbnailRendering,
  waitForThumbnailDiscovery: async () => {
    await thumbnailOptimizationDiscoveryQueue;
  },
  invalidateSearchSnapshot: (directoryIds) => searchScanSnapshotService.invalidate(directoryIds),
  deleteDirectoryIndex: deleteDirectoryImages,
  discardEmbeddedMetadataCandidates: discardEmbeddedMetadataForDirectory,
  discardOptimizationCandidates: discardThumbnailOptimizationCandidatesForDirectory,
  discardQueuedRenders: discardQueuedThumbnailRendersForDirectory,
  deleteDirectoryThumbnails: deleteThumbnailsForDirectory,
  deleteFileThumbnails: deleteThumbnailsForImages,
  deleteDirectory,
  resumeThumbnailRendering,
  resumeThumbnailOptimization
});

interface SkimReadTaskState {
  cancelled: boolean;
}

const skimReadTasks = new Map<string, SkimReadTaskState>();

ipcMain.handle("skim:listLocations", async () => {
  const preferences = await getUserPreferences();
  const systemLocations = [
    { id: "computer", kind: "computer", path: null, classId: "{20D04FE0-3AEA-1069-A2D8-08002B30309D}", fallbackName: t("skim.computer") },
    { id: "desktop", kind: "desktop", path: app.getPath("desktop"), knownFolderId: "{B4BFCC3A-DB2C-424C-B029-7FE99A87C641}", fallbackName: t("skim.locationPicker.desktop") },
    { id: "downloads", kind: "downloads", path: app.getPath("downloads"), knownFolderId: "{374DE290-123F-4565-9164-39C4925E467B}", fallbackName: t("skim.locationPicker.downloads") },
    { id: "documents", kind: "documents", path: app.getPath("documents"), knownFolderId: "{FDD39AD0-238F-46AF-ADB4-6C85480369C7}", fallbackName: t("skim.locationPicker.documents") },
    { id: "pictures", kind: "pictures", path: app.getPath("pictures"), knownFolderId: "{33E28130-4E1E-4676-835A-98395C3BC3BB}", fallbackName: t("skim.locationPicker.pictures") },
    { id: "music", kind: "music", path: app.getPath("music"), knownFolderId: "{4BD8D571-6D19-48D3-BE97-422220080E43}", fallbackName: t("skim.locationPicker.music") },
    { id: "videos", kind: "videos", path: app.getPath("videos"), knownFolderId: "{18989B1D-99B5-455B-841C-AB7C74E4DDFC}", fallbackName: t("skim.locationPicker.videos") }
  ] as const;
  const displayNames = await getWindowsKnownFolderDisplayNames(systemLocations);
  return [
    ...systemLocations.map(({ id, kind, path: locationPath, fallbackName }) => ({
      id,
      kind,
      path: locationPath,
      name: displayNames.get(id) ?? fallbackName
    })),
    ...preferences.skimSidebarFolders.map((folderPath, index) => ({
      id: `starred-${index}-${folderPath.toLowerCase()}`,
      kind: "starred",
      path: folderPath,
      name: path.basename(folderPath) || folderPath
    }))
  ];
});

ipcMain.handle("skim:resolveDirectoryPath", async (_event, input: unknown) => {
  if (typeof input !== "string" || input.length === 0 || input.length > 32_768) {
    return null;
  }
  try {
    return await resolveReadableSkimDirectoryPath(input);
  } catch {
    return null;
  }
});

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
    !isMainSenderAllowed(event)
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

ipcMain.handle("skim:readFileInfoDimensions", async (event, filePath: unknown) => {
  if (
    !isMainSenderAllowed(event)
    || typeof filePath !== "string"
    || !path.isAbsolute(filePath)
  ) {
    return null;
  }
  try {
    const normalizedPath = path.normalize(path.resolve(filePath));
    const stats = await fs.lstat(normalizedPath);
    if (stats.isSymbolicLink() || !stats.isFile()) return null;
    return await readVisualSourceDimensions(normalizedPath);
  } catch {
    return null;
  }
});

ipcMain.handle("skim:readFileInfoFolderStats", async (event, request: unknown) => {
  const candidate = request && typeof request === "object"
    ? request as { taskId?: unknown; path?: unknown }
    : {};
  if (
    !mainWindow
    || mainWindow.isDestroyed()
    || event.sender !== mainWindow.webContents
    || typeof candidate.taskId !== "string"
    || candidate.taskId.length === 0
    || candidate.taskId.length > 128
    || typeof candidate.path !== "string"
    || !path.isAbsolute(candidate.path)
  ) {
    return null;
  }

  if (activeFileInfoFolderStatsTask) activeFileInfoFolderStatsTask.cancelled = true;
  const task = {
    taskId: candidate.taskId,
    path: path.normalize(path.resolve(candidate.path)),
    cancelled: false
  };
  activeFileInfoFolderStatsTask = task;
  try {
    const stats = await fs.lstat(task.path);
    if (stats.isSymbolicLink() || !stats.isDirectory()) return null;
    return await collectSkimFolderStats(
      task.path,
      () => task.cancelled || activeFileInfoFolderStatsTask !== task,
      () => undefined
    );
  } catch {
    return null;
  } finally {
    if (activeFileInfoFolderStatsTask === task) activeFileInfoFolderStatsTask = null;
  }
});

ipcMain.handle("skim:cancelFileInfoFolderStats", (event, taskId: unknown) => {
  if (
    !mainWindow
    || mainWindow.isDestroyed()
    || event.sender !== mainWindow.webContents
    || typeof taskId !== "string"
    || activeFileInfoFolderStatsTask?.taskId !== taskId
  ) {
    return false;
  }
  activeFileInfoFolderStatsTask.cancelled = true;
  activeFileInfoFolderStatsTask = null;
  return true;
});

searchIpcController = registerSearchIpc({
  registrar: ipcMain,
  isSenderAllowed: isMainSenderAllowed,
  translateSearchFailed: () => t("search.failed"),
  listDirectories,
  search: (search, directories, options) => searchImagesWithAddedDirectories(
    search as Parameters<typeof searchImagesWithAddedDirectories>[0],
    directories,
    enqueueScannedThumbnails,
    options
  ),
  refresh: (directoryIds) => searchScanSnapshotService.invalidate(directoryIds),
  diagnostics: runtimeDiagnostics
});

registerManualMetadataIpc({
  registrar: ipcMain,
  isBatchSenderAllowed: isMainSenderAllowed,
  listDirectories,
  upsertFileKeywords: upsertFileManualKeywords,
  updateKeywordsBatch: updateManualKeywordsBatch,
  translate: t
});

registerAiSearchIpc({
  registrar: ipcMain,
  isMainSenderAllowed,
  startSearch: (request, emit) => aiSearchService.start(request, emit),
  cancelSearch: (sessionId, discard) => aiSearchService.cancel(sessionId, discard)
});

registerRuntimeModelIpc({
  registrar: ipcMain,
  getRuntimeSettings: getLlamaRuntimeSettings,
  updateSelectedRuntime: updateSelectedLlamaRuntime,
  getRuntimeProcessState: getLlamaRuntimeProcessState,
  startRuntime: startLlamaRuntime,
  stopRuntime: stopLlamaRuntime,
  getModelSettings: getGgufModelSettings,
  updateSelectedModel: updateSelectedGgufModel,
  syncIdleSelectionState: syncIdleLlamaRuntimeSelectionState,
  translateRuntimeSwitchBlocked: () => t("error.stopServerBeforeRuntimeSwitch"),
  translateModelSwitchBlocked: () => t("error.stopServerBeforeModelSwitch")
});

registerDiagnosticsIpc({
  registrar: ipcMain,
  isSenderAllowed: isMainSenderAllowed,
  diagnostics: runtimeDiagnostics,
  appVersion: app.getVersion(),
  documentsPath: app.getPath("documents"),
  additionalLogPaths: [
    path.join(app.getPath("userData"), "logs", "app-update.log"),
    path.join(app.getPath("userData"), "logs", "llama-runtime.log")
  ],
  chooseExportPath: async (defaultPath) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath,
      filters: [{ name: "ZIP", extensions: ["zip"] }]
    });
    return result.canceled ? null : result.filePath ?? null;
  }
});

registerPreferenceIpc({
  registrar: ipcMain,
  getPreferences: getUserPreferences,
  updateSkimSort: updateSkimSortPreference,
  updateOperationHints: updateOperationHintsPreference,
  updateCommandEnabled: updateCommandEnabledPreference,
  updateSearchLabelVisibility: updateSearchLabelVisibilityPreference,
  updateSkimDisplay: updateSkimDisplayPreference,
  updateSkimSidebarFolders: updateSkimSidebarFoldersPreference,
  updateSkimSystemLocationsCollapsed: updateSkimSystemLocationsCollapsedPreference,
  updateTheme: updateThemePreference,
  refreshAppearance: () => { lineWindowController.refreshAppearance(); void refreshMainWindowPresentationAppearance(); },
  applyLanguage: applyLanguagePreference,
  updateSort: updateSortPreference,
  applyThumbnailSort: (sortPreference) => {
    setThumbnailOptimizationSort(sortPreference.sortField, sortPreference.sortDirection);
  },
  updateAppearanceColors: updateAppearanceColorsPreference,
  setEdgeCollapseEnabled,
  setRememberWindowLayout: async (enabled) => {
    const preferences = await updateRememberWindowLayoutPreference(enabled);
    windowLayoutManager.setPreferences(preferences);
    return preferences;
  },
  updateWindowPresentationMode: updateWindowPresentationModePreference,
  setStandbyLineVisible,
  updateLaunchAtLogin: updateLaunchAtLoginPreference,
  applyLaunchAtLogin: applyLaunchAtLoginPreference,
  updateSystemNotifications: updateSystemNotificationsPreference,
  applySystemNotifications: (enabled) => {
    systemNotificationsEnabled = enabled;
  },
  updateAutoCacheOptimization: updateAutoCacheOptimizationPreference, updateAiRecognitionEnabled: updateAiRecognitionEnabledPreference,
  setAutoCacheOptimizationEnabled: setThumbnailOptimizationEnabled,
  scheduleAutoCacheOptimization: async () => {
    scheduleDirectoryThumbnailOptimization(await listDirectories());
    void scheduleRecognizedModelInputCacheCleanup();
  }
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

ipcMain.handle("preferences:updateShortcutActions", async (_event, shortcutActions: {
  activateCapsule: string;
  activateMicro: string;
  activateMini: string;
  activateNormal: string;
  activateStandby: string;
  activateSkim: string;
  cycleDirectory: string;
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

registerCacheActivityIpc({
  registrar: ipcMain,
  isMainSenderAllowed,
  getCacheStats: getAllVisualCacheStats,
  getOptimizationStatus: getThumbnailOptimizationStatus,
  setContentViewActive: (active) => {
    rendererContentViewActive = active;
    if (!rendererContentViewActive) {
      resumeThumbnailOptimization("grid-interaction");
    }
    syncThumbnailOptimizationActivity();
  },
  discardQueuedInteractiveThumbnails: discardQueuedInteractiveThumbnailRenders,
  setGridInteractionActive: (active) => {
    const pauseReason = "grid-interaction";
    if (active) {
      void pauseThumbnailOptimization(pauseReason);
    } else {
      resumeThumbnailOptimization(pauseReason);
    }
  }
});

const clearFormalVisualCacheSafely = async (clear: typeof clearAllVisualCaches) => {
  const renderingPauseReason = "cache-clear";
  await pauseThumbnailRendering(renderingPauseReason);
  try {
    discardAllQueuedThumbnailRenders();
    await setThumbnailOptimizationEnabled(false);
    await updateAutoCacheOptimizationPreference(false);
    return await clear();
  } finally {
    resumeThumbnailRendering(renderingPauseReason);
  }
};

registerCacheClearIpc({
  registrar: ipcMain,
  createToken: randomUUID,
  translateConfirmationRequired: () => t("error.cacheConfirmationRequired"),
  clearFormalCache: () => clearFormalVisualCacheSafely(clearAllVisualCaches),
  clearThumbnailCache: () => clearFormalVisualCacheSafely(clearThumbnailCaches),
  getSkimCacheStats,
  clearSkimCache: clearSkimCacheSafely
});
