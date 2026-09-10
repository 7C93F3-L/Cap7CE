import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AppearanceColors, ArchivePreviewFallbackReason, EpubPreviewFallbackReason, FontPreviewFallbackReason, MobiPreviewFallbackReason, PreviewWindowControlState, PreviewWindowData, SkimFolderStats, ThemeMode, UiFontSize, WindowMaterial } from "../shared/types";
import CustomScrollbar from "./CustomScrollbar";
import SvgIcon from "./components/SvgIcon";
import { getFormatIconSvg } from "./formatIcons";
import skimFolderSvg from "./assets/icons/skim-folder.svg?raw";
import WaitingIndicator from "./WaitingIndicator";
import PdfPreviewPanel from "./PdfPreviewPanel";
import FontPreviewPanel from "./FontPreviewPanel";
import PreviewInformationSidebar from "./preview/PreviewInformationSidebar";
import StablePreviewTitlebar from "./preview/StablePreviewTitlebar";
import { previewSidebarExpandedWidth, usePreviewSidebarLayout } from "./preview/usePreviewSidebarLayout";
import { getPreviewWheelNavigationDirection, isPreviewNavigationSuppressedTarget } from "./preview/previewNavigationTarget";
import { usePreviewImageTransform } from "./preview/usePreviewImageTransform";
import { getFileContextShortcutAction } from "./fileContextActions";
import { createSpaceHoldController, isPlainSpaceShortcut } from "./keywordEditorInteraction";
import { isEditableKeyboardTarget } from "./keyboardTarget";
import { setActiveLanguage, t } from "../../electron/localization";
import { getTextColorForBackground } from "./appearance";
import { defaultUiFontSize, useUiFontSize } from "./typography";
import { useTransientFeedback } from "./controllers/useTransientFeedback";
import { useSystemThemeMode } from "./controllers/useSystemThemeMode";
import "./stable-ui/StableMaterialContrast.css";

const defaultPreviewWindowControlState: PreviewWindowControlState = {
  isMaximized: false,
  isAlwaysOnTop: false
};

const previewLoadingIndicatorDelayMs = 180;

const markdownComponents: Components = {
  a: ({ children, href }) => (
    <span className="preview-markdown-link" title={href}>{children}</span>
  ),
  img: ({ alt, src }) => (
    <span className="preview-markdown-image-reference" title={src}>
      {alt || src || "image"}
    </span>
  )
};

const formatPreviewBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
};

const getArchiveFallbackMessage = (reason: ArchivePreviewFallbackReason) => {
  switch (reason) {
    case "passwordRequired": return t("preview.archiveFallback.passwordRequired");
    case "invalidArchive": return t("preview.archiveFallback.invalidArchive");
    case "unsupportedArchive": return t("preview.archiveFallback.unsupportedArchive");
    case "tooLarge": return t("preview.archiveFallback.tooLarge");
    case "timedOut": return t("preview.archiveFallback.timedOut");
    default: return t("preview.archiveFallback.failed");
  }
};

const getFontFallbackMessage = (reason: FontPreviewFallbackReason) => {
  switch (reason) {
    case "invalidFont": return t("preview.fontFallback.invalidFont");
    case "tooLarge": return t("preview.fontFallback.tooLarge");
    case "timedOut": return t("preview.fontFallback.timedOut");
    default: return t("preview.fontFallback.failed");
  }
};
const getEpubFallbackMessage = (reason: EpubPreviewFallbackReason) => {
  switch (reason) {
    case "invalidEpub": return t("preview.epubFallback.invalidEpub");
    case "encrypted": return t("preview.epubFallback.encrypted");
    case "tooLarge": return t("preview.epubFallback.tooLarge");
    case "timedOut": return t("preview.epubFallback.timedOut");
    default: return t("preview.epubFallback.failed");
  }
};
const getMobiFallbackMessage = (reason: MobiPreviewFallbackReason) => {
  switch (reason) {
    case "invalidMobi": return t("preview.mobiFallback.invalidMobi");
    case "encrypted": return t("preview.mobiFallback.encrypted");
    case "unsupportedMobi": return t("preview.mobiFallback.unsupportedMobi");
    case "tooLarge": return t("preview.mobiFallback.tooLarge");
    case "timedOut": return t("preview.mobiFallback.timedOut");
    default: return t("preview.mobiFallback.failed");
  }
};

const PreviewWindowApp = () => {
  const [previewData, setPreviewData] = useState<PreviewWindowData | null>(null);
  const [themePreference, setThemePreference] = useState<ThemeMode | null>(null);
  const [appearanceColors, setAppearanceColors] = useState<AppearanceColors | null>(null);
  const [uiFontSize, setUiFontSize] = useState<UiFontSize>(defaultUiFontSize);
  const [windowMaterial, setWindowMaterial] = useState<WindowMaterial>("acrylic");
  const [displaySrc, setDisplaySrc] = useState("");
  const [usingFallback, setUsingFallback] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [showInfoFallback, setShowInfoFallback] = useState(false);
  const [fontRuntimeFailed, setFontRuntimeFailed] = useState(false);
  const [showPreviewLoadingIndicator, setShowPreviewLoadingIndicator] = useState(false);
  const [windowControlState, setWindowControlState] = useState(defaultPreviewWindowControlState);
  const [folderStats, setFolderStats] = useState<SkimFolderStats | null>(null);
  const [previewKeywordEditorOpen, setPreviewKeywordEditorOpen] = useState(false);
  const [previewKeywordSavePending, setPreviewKeywordSavePending] = useState(false);
  const [previewKeywordSaveError, setPreviewKeywordSaveError] = useState("");
  const { message: copiedPreviewSessionId, show: showPreviewPathCopied } = useTransientFeedback(1800);
  const previewSidebarLayout = usePreviewSidebarLayout();
  const previewSidebarWidth = previewSidebarLayout.expanded ? previewSidebarExpandedWidth : 40;
  const wheelThrottleRef = useRef(0);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const imageTransform = usePreviewImageTransform(previewData?.sessionId ?? "", imageRef, true);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const textScrollRef = useRef<HTMLElement | null>(null);
  const pdfScrollRef = useRef<HTMLDivElement>(null);
  const archiveScrollRef = useRef<HTMLDivElement>(null);
  const epubScrollRef = useRef<HTMLDivElement>(null);
  const mobiScrollRef = useRef<HTMLDivElement>(null);
  const targetSessionIdRef = useRef("");
  const targetFilePathRef = useRef("");
  const previewLoadingIndicatorTimerRef = useRef<number | null>(null);
  const pendingLongSpaceActionRef = useRef<PreviewWindowData | null>(null);
  const previewKeywordSavePendingRef = useRef(false);
  const systemTheme = useSystemThemeMode();
  const uiFontStyle = useUiFontSize(uiFontSize);
  const closePreview = useCallback(() => {
    mediaRef.current?.pause();
    if (previewData?.provider === "folderInfo") {
      void window.cap7ce?.skim.cancelFolderStats(previewData.sessionId);
    }
    void window.cap7ce?.preview.close();
  }, [previewData]);
  const requestKeywordEdit = useCallback((data: PreviewWindowData) => {
    if (data.skimActive) return;
    setPreviewKeywordSaveError("");
    setPreviewKeywordEditorOpen(true);
  }, []);
  const spaceHoldControllerRef = useRef<ReturnType<typeof createSpaceHoldController<PreviewWindowData>> | null>(null);
  if (!spaceHoldControllerRef.current) {
    spaceHoldControllerRef.current = createSpaceHoldController<PreviewWindowData>({
      delayMs: 350,
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancelScheduled: (handle) => window.clearTimeout(handle as number),
      onShortPress: () => undefined,
      onLongPress: () => undefined
    });
  }
  const spaceHoldController = spaceHoldControllerRef.current;
  spaceHoldController.updateHandlers({
    onShortPress: closePreview,
    onLongPress: (data) => {
      pendingLongSpaceActionRef.current = data;
    }
  });

  useEffect(() => {
    const unsubscribe = window.cap7ce?.preview.onData((data) => {
      mediaRef.current?.pause();
      setActiveLanguage(data.language);
      setPreviewData(data);
      if (targetSessionIdRef.current !== data.sessionId || targetFilePathRef.current !== data.filePath) {
        previewKeywordSavePendingRef.current = false;
        setPreviewKeywordEditorOpen(false);
        setPreviewKeywordSavePending(false);
        setPreviewKeywordSaveError("");
      }
      targetFilePathRef.current = data.filePath;
      if (targetSessionIdRef.current === data.sessionId) {
        return;
      }
      setFolderStats(data.provider === "folderInfo" ? {
        fileCount: 0,
        folderCount: 0,
        totalSize: 0,
        skippedCount: 0,
        status: "scanning"
      } : null);
      setShowInfoFallback(false);
      setFontRuntimeFailed(false);
      targetSessionIdRef.current = data.sessionId;
      if (previewLoadingIndicatorTimerRef.current !== null) {
        window.clearTimeout(previewLoadingIndicatorTimerRef.current);
      }
      setShowPreviewLoadingIndicator(false);
      setDisplaySrc(data.previewUrl);
      setUsingFallback(false);
      const isImageProvider = !data.provider || data.provider === "image";
      setIsPreviewLoading(isImageProvider);
      if (!isImageProvider) {
        void window.cap7ce?.preview.getWindowControlState().then(setWindowControlState);
        return;
      }
      previewLoadingIndicatorTimerRef.current = window.setTimeout(() => {
        if (targetSessionIdRef.current === data.sessionId) {
          setShowPreviewLoadingIndicator(true);
        }
        previewLoadingIndicatorTimerRef.current = null;
      }, previewLoadingIndicatorDelayMs);
      void window.cap7ce?.preview.getWindowControlState().then(setWindowControlState);
    });
    window.cap7ce?.preview.requestData();
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    void window.cap7ce?.preferences.get().then((preferences) => {
      if (!preferences) return;
      setThemePreference(preferences.themePreference);
      setAppearanceColors(preferences.appearanceColors);
      setUiFontSize(preferences.uiFontSize);
      setWindowMaterial(preferences.windowMaterial);
    });
    return window.cap7ce?.preferences.onChanged((preferences) => {
      setThemePreference(preferences.themePreference);
      setAppearanceColors(preferences.appearanceColors);
      setUiFontSize(preferences.uiFontSize);
      setWindowMaterial(preferences.windowMaterial);
    });
  }, []);

  useEffect(() => window.cap7ce?.preview.onEmbeddedMetadata((update) => {
    setPreviewData((current) => current
      && current.sessionId === update.sessionId
      && current.filePath === update.filePath
      ? { ...current, embeddedMetadata: update.embeddedMetadata }
      : current);
  }), []);

  useEffect(() => window.cap7ce?.skim.onFolderStats((update) => {
    if (targetSessionIdRef.current === update.sessionId && targetFilePathRef.current === update.path) {
      setFolderStats(update);
    }
  }), []);

  useEffect(() => {
    if (
      !previewData
      || ((!previewData.provider || previewData.provider === "image" || previewData.provider === "video") && !showInfoFallback)
    ) return;
    const hasExtendedInfoFallback = showInfoFallback
      || Boolean(previewData.archiveFallbackReason)
      || Boolean(previewData.fontFallbackReason)
      || Boolean(previewData.epubFallbackReason)
      || Boolean(previewData.mobiFallbackReason);
    const infoDimensions = previewData.info?.kind === "folder"
      ? { width: 600, height: 580 }
      : { width: 600, height: hasExtendedInfoFallback ? 450 : 380 };
    const dimensions = showInfoFallback
      ? infoDimensions
      : previewData.provider === "video"
      ? { width: 960, height: 600 }
      : previewData.provider === "audio"
        ? { width: 640, height: 260 }
        : previewData.provider === "text"
          ? { width: 760, height: 600 }
          : previewData.provider === "pdf"
            ? { width: 920, height: 700 }
          : previewData.provider === "archive"
            ? { width: 800, height: 620 }
          : previewData.provider === "font"
            ? { width: 780, height: 520 }
          : previewData.provider === "epub"
            ? { width: 820, height: 680 }
          : previewData.provider === "mobi"
            ? { width: 820, height: 680 }
          : infoDimensions;
    window.cap7ce?.preview.contentSize({
      sessionId: previewData.sessionId,
      filePath: previewData.filePath,
      ...dimensions,
      sidebarWidth: previewSidebarWidth
    });
  }, [previewData, previewSidebarWidth, showInfoFallback]);

  useEffect(() => {
    if (
      showInfoFallback
      || (previewData?.provider !== "audio" && previewData?.provider !== "video")
      || !mediaRef.current
    ) {
      return;
    }
    void mediaRef.current.play().catch(() => {
      // Keep native controls available when the runtime or codec blocks autoplay.
    });
  }, [previewData, showInfoFallback]);

  useEffect(() => {
    const resetPreviewSession = () => {
      if (previewLoadingIndicatorTimerRef.current !== null) {
        window.clearTimeout(previewLoadingIndicatorTimerRef.current);
        previewLoadingIndicatorTimerRef.current = null;
      }
      targetSessionIdRef.current = "";
      targetFilePathRef.current = "";
      mediaRef.current?.pause();
      if (mediaRef.current) mediaRef.current.removeAttribute("src");
      setPreviewData(null);
      setDisplaySrc("");
      setUsingFallback(false);
      setIsPreviewLoading(false);
      setShowInfoFallback(false);
      setFontRuntimeFailed(false);
      setShowPreviewLoadingIndicator(false);
      previewKeywordSavePendingRef.current = false;
      setPreviewKeywordEditorOpen(false);
      setPreviewKeywordSavePending(false);
      setPreviewKeywordSaveError("");
      setFolderStats(null);
      void window.cap7ce?.preview.getWindowControlState().then(setWindowControlState);
    };
    const unsubscribe = window.cap7ce?.preview.onReset(resetPreviewSession);
    return () => {
      unsubscribe?.();
      if (previewLoadingIndicatorTimerRef.current !== null) {
        window.clearTimeout(previewLoadingIndicatorTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const syncWindowControlState = () => {
      void window.cap7ce?.preview.getWindowControlState().then(setWindowControlState);
    };
    syncWindowControlState();
    window.addEventListener("resize", syncWindowControlState);
    return () => window.removeEventListener("resize", syncWindowControlState);
  }, []);

  useEffect(() => {
    const image = imageRef.current;
    if (!previewData || !image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      return;
    }
    window.cap7ce?.preview.contentSize({
      sessionId: previewData.sessionId,
      filePath: previewData.filePath,
      width: image.naturalWidth,
      height: image.naturalHeight,
      sidebarWidth: previewSidebarWidth
    });
  }, [displaySrc, previewData, previewSidebarWidth]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closePreview();
        return;
      }
      if (isPreviewNavigationSuppressedTarget(event.target)) return;
      if (isPlainSpaceShortcut(event)) {
        event.preventDefault();
        if (event.repeat || !previewData) return;
        if (previewData.skimActive) {
          closePreview();
          return;
        }
        pendingLongSpaceActionRef.current = null;
        spaceHoldController.start(previewData);
        return;
      }

      const fileShortcutAction = getFileContextShortcutAction(event);
      if (
        previewData
        && fileShortcutAction
        && fileShortcutAction !== "addDirectory"
        && fileShortcutAction !== "addToSidebar"
      ) {
        if (fileShortcutAction === "delete" && previewData.skimActive) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        if (fileShortcutAction === "open") {
          void window.cap7ce?.files.open(previewData.filePath).then((result) => {
            if (result === "") closePreview();
          });
        } else if (fileShortcutAction === "showInFolder") {
          void window.cap7ce?.files.showInFolder(previewData.filePath);
        } else if (fileShortcutAction === "copyPaths") {
          void window.cap7ce?.files.copyPaths([previewData.filePath]).then((count) => { if (count > 0) showPreviewPathCopied(previewData.sessionId); }, () => undefined);
        } else if (fileShortcutAction === "delete") {
          void window.cap7ce?.preview.requestItemAction({
            action: "deleteFile",
            itemId: previewData.itemId,
            filePath: previewData.filePath
          });
        }
        return;
      }

      if (mediaRef.current && document.activeElement === mediaRef.current) return;
      if (previewData?.provider === "pdf" && (event.key === "PageUp" || event.key === "PageDown")) {
        event.preventDefault();
        pdfScrollRef.current?.scrollBy({
          top: (event.key === "PageDown" ? 1 : -1) * (pdfScrollRef.current.clientHeight * 0.9),
          behavior: "auto"
        });
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        window.cap7ce?.preview.navigate(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        window.cap7ce?.preview.navigate(1);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !spaceHoldController.isActive()) return;
      event.preventDefault();
      const pendingLongSpaceAction = pendingLongSpaceActionRef.current;
      pendingLongSpaceActionRef.current = null;
      spaceHoldController.release();
      if (pendingLongSpaceAction) {
        requestKeywordEdit(pendingLongSpaceAction);
      }
    };

    const cancelSpaceHold = () => {
      pendingLongSpaceActionRef.current = null;
      spaceHoldController.cancel();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", cancelSpaceHold);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", cancelSpaceHold);
      cancelSpaceHold();
    };
  }, [closePreview, previewData, requestKeywordEdit, showPreviewPathCopied, spaceHoldController]);

  const savePreviewKeywords = useCallback(async (keywords: string[]) => {
    if (!previewData || previewData.skimActive || previewKeywordSavePendingRef.current) return;
    previewKeywordSavePendingRef.current = true;
    setPreviewKeywordSavePending(true);
    setPreviewKeywordSaveError("");
    try {
      const normalizedKeywords = await window.cap7ce?.index.updateManualKeywords(
        previewData.filePath,
        keywords.join(",")
      );
      if (!normalizedKeywords) throw new Error(t("error.indexUnavailable"));
      setPreviewData((current) => current
        && current.sessionId === previewData.sessionId
        && current.filePath === previewData.filePath
        ? { ...current, manualKeywords: normalizedKeywords }
        : current);
      setPreviewKeywordEditorOpen(false);
    } catch (error) {
      setPreviewKeywordSaveError(error instanceof Error ? error.message : t("error.metadataSaveFailed"));
    } finally {
      previewKeywordSavePendingRef.current = false;
      setPreviewKeywordSavePending(false);
    }
  }, [previewData]);

  const effectiveTheme = themePreference === null
    ? previewData?.theme ?? systemTheme
    : themePreference === "system" ? systemTheme : themePreference;
  const effectiveAppearanceColors = appearanceColors ?? previewData?.appearanceColors;
  const themeStyle = useMemo(() => {
    if (!effectiveAppearanceColors) {
      return {} as CSSProperties;
    }
    const isDark = effectiveTheme === "dark";
    return {
      ...uiFontStyle,
      "--theme-color": effectiveAppearanceColors.themeColor,
      "--accent-color": effectiveAppearanceColors.accentColor,
      "--preview-action-hover-text": getTextColorForBackground(effectiveAppearanceColors.themeColor, effectiveAppearanceColors.accentColor),
      "--app-bg": isDark ? "#191919" : "#ffffff",
      "--panel-bg": isDark ? "#282828" : "#f2f2f2",
      "--text-main": isDark ? "#b2b2b2" : "#111111",
      "--icon-muted": isDark ? "#4f4f4f" : "#777777",
      "--border-soft": isDark ? "#2a2a2a" : "#ececec"
    } as CSSProperties;
  }, [effectiveAppearanceColors, effectiveTheme, uiFontStyle]);

  const togglePreviewAlwaysOnTop = () => {
    void window.cap7ce?.preview.toggleAlwaysOnTop().then(setWindowControlState);
  };
  if (!previewData) {
    return <main className="preview-window-root" />;
  }
  const isImageProvider = (!previewData.provider || previewData.provider === "image") && !showInfoFallback;
  const folderStatsStatus = folderStats?.status === "completed"
    ? t("skim.previewStats.completed")
    : folderStats?.status === "cancelled"
      ? t("skim.previewStats.cancelled")
      : t("skim.previewStats.scanning");
  const isMarkdownPreview = previewData.provider === "text"
    && previewData.fileName.toLocaleLowerCase().endsWith(".md");
  const previewInfoFormat = previewData.info?.kind === "folder"
    ? t("skim.folder")
    : (previewData.info?.extension || t("skim.file")).replace(/^\./u, "").toUpperCase();

  return (
    <main
      className={`app theme-${effectiveTheme} preview-window-root preview-window-stable-ui${windowControlState.isMaximized ? " preview-window-maximized" : ""}`}
      data-window-material={windowMaterial}
      style={themeStyle}
      role="dialog"
      aria-label={previewData.fileName}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      onWheelCapture={(event) => {
        if (isImageProvider && (event.target as Element).closest?.("[data-preview-image-canvas='true']") && imageTransform.handleWheel(event)) {
          return;
        }
        if (isPreviewNavigationSuppressedTarget(event.target) || (event.target as Element).closest?.("[data-preview-provider-interactive='true'], [data-preview-pdf-scroll='true']")) {
          return;
        }
        const contentScroll = previewData.provider === "text"
          ? textScrollRef.current
          : previewData.provider === "pdf"
            ? pdfScrollRef.current
            : previewData.provider === "archive"
              ? archiveScrollRef.current
            : previewData.provider === "epub"
              ? epubScrollRef.current
            : previewData.provider === "mobi"
              ? mobiScrollRef.current
            : null;
        if (contentScroll && !showInfoFallback) {
          event.preventDefault();
          const deltaMultiplier = event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
              ? contentScroll.clientHeight
              : 1;
          contentScroll.scrollBy({
            top: event.deltaY * deltaMultiplier,
            left: event.deltaX * deltaMultiplier,
            behavior: "auto"
          });
          return;
        }
        event.preventDefault();
        const now = window.performance.now();
        if (now - wheelThrottleRef.current < 200) {
          return;
        }
        wheelThrottleRef.current = now;
        const direction = getPreviewWheelNavigationDirection(event.deltaX, event.deltaY);
        if (direction) window.cap7ce?.preview.navigate(direction);
      }}
    >
      <StablePreviewTitlebar pinned={windowControlState.isAlwaysOnTop} label={windowControlState.isAlwaysOnTop ? t("preview.unpin") : t("preview.pin")} onTogglePinned={togglePreviewAlwaysOnTop} theme={effectiveTheme} windowMaterial={windowMaterial} />
      <div
        className="preview-window-shell preview-stable-shell"
        style={{ "--preview-sidebar-width": `${previewSidebarExpandedWidth}px` } as CSSProperties}
      >
        <PreviewInformationSidebar
          data={previewData}
          expanded={previewSidebarLayout.expanded}
          keywordEditorOpen={previewKeywordEditorOpen}
          keywordSavePending={previewKeywordSavePending}
          keywordSaveError={previewKeywordSaveError}
          onToggleExpanded={previewSidebarLayout.toggleExpanded}
          onOpen={() => {
            void window.cap7ce?.files.open(previewData.filePath).then((result) => {
              if (result === "") closePreview();
            });
          }}
          onShowInFolder={() => { void window.cap7ce?.files.showInFolder(previewData.filePath); }}
          onCopyPath={() => { void window.cap7ce?.files.copyPaths([previewData.filePath]).then((count) => { if (count > 0) showPreviewPathCopied(previewData.sessionId); }, () => undefined); }}
          copyPathCopied={copiedPreviewSessionId === previewData.sessionId}
          onEditKeywords={() => requestKeywordEdit(previewData)}
          onCancelKeywordEdit={() => {
            if (previewKeywordSavePending) return;
            setPreviewKeywordEditorOpen(false);
            setPreviewKeywordSaveError("");
          }}
          onSaveKeywords={(keywords) => { void savePreviewKeywords(keywords); }}
          onDelete={() => {
            void window.cap7ce?.preview.requestItemAction({ action: "deleteFile", itemId: previewData.itemId, filePath: previewData.filePath });
          }}
        />
        <div className="preview-window-stage preview-stable-stage">
          <div className="preview-window-content">
        {showPreviewLoadingIndicator && (
          <div className="preview-window-loading" role="status" aria-live="polite">
            <WaitingIndicator className="preview-window-waiting-icon" />
            <span>{t("preview.loading")}</span>
          </div>
        )}
        {isImageProvider ? <div
          ref={imageTransform.canvasRef}
          className={`preview-visual-with-metadata preview-image-transform-canvas${imageTransform.pannable ? " is-pannable" : ""}${imageTransform.dragging ? " is-dragging" : ""}${imageTransform.zoomDragging ? " is-zoom-dragging" : ""}`}
          data-preview-image-canvas="true"
          onPointerDown={imageTransform.handlePointerDown}
          onPointerMove={imageTransform.handlePointerMove}
          onPointerUp={imageTransform.finishPointer}
          onPointerCancel={imageTransform.finishPointer}
          onLostPointerCapture={imageTransform.finishPointer}
          onDoubleClick={imageTransform.reset}
        >
          <img
          key={`${previewData.sessionId}:${displaySrc}`}
          ref={imageRef}
          className={`preview-window-image${isPreviewLoading ? " is-loading" : ""}`}
          src={displaySrc}
          alt={previewData.fileName}
          draggable={false}
          style={imageTransform.imageStyle}
          onLoad={(event) => {
            if (previewLoadingIndicatorTimerRef.current !== null) {
              window.clearTimeout(previewLoadingIndicatorTimerRef.current);
              previewLoadingIndicatorTimerRef.current = null;
            }
            setShowPreviewLoadingIndicator(false);
            setIsPreviewLoading(false);
            imageTransform.reconcile();
            window.cap7ce?.preview.contentSize({
              sessionId: previewData.sessionId,
              filePath: previewData.filePath,
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
              sidebarWidth: previewSidebarWidth
            });
          }}
          onError={() => {
            if (!usingFallback && displaySrc !== previewData.thumbnailUrl) {
              setUsingFallback(true);
              setDisplaySrc(previewData.thumbnailUrl);
              return;
            }
            if (previewLoadingIndicatorTimerRef.current !== null) {
              window.clearTimeout(previewLoadingIndicatorTimerRef.current);
              previewLoadingIndicatorTimerRef.current = null;
            }
            setShowPreviewLoadingIndicator(false);
            setIsPreviewLoading(false);
            if (previewData.provider === "image" && previewData.info) {
              setShowInfoFallback(true);
              return;
            }
            window.cap7ce?.preview.contentSize({
              sessionId: previewData.sessionId,
              filePath: previewData.filePath,
              width: 1,
              height: 1,
              sidebarWidth: previewSidebarWidth
            });
          }}
          />
        </div> : previewData.provider === "text" && previewData.textPreview && !showInfoFallback ? (
          <section className="preview-text-panel">
            <header>
              <div className="preview-text-heading">
                <strong>{previewData.fileName}</strong>
              </div>
              <span>{previewData.textPreview.encoding}{previewData.textPreview.truncated ? ` · ${t("preview.textTruncated")}` : ""}</span>
            </header>
            {isMarkdownPreview ? (
              <div
                ref={(node) => { textScrollRef.current = node; }}
                className="preview-markdown-content cap-main-scroll-viewport"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  skipHtml
                  components={markdownComponents}
                >
                  {previewData.textPreview.content}
                </ReactMarkdown>
              </div>
            ) : (
              <pre
                ref={(node) => { textScrollRef.current = node; }}
                className="cap-main-scroll-viewport"
              >
                {previewData.textPreview.content}
              </pre>
            )}
          </section>
        ) : previewData.provider === "pdf" && previewData.pdfPreview && !showInfoFallback ? (
          <PdfPreviewPanel
            data={{ ...previewData, pdfPreview: previewData.pdfPreview }}
            scrollRef={pdfScrollRef}
            onError={() => setShowInfoFallback(true)}
          />
        ) : previewData.provider === "archive" && previewData.archivePreview && !showInfoFallback ? (
          <section className="preview-archive-panel">
            <header>
              <strong>{previewData.fileName}</strong>
              <span>{t("preview.archiveSummary", {
                count: previewData.archivePreview.entryCount,
                size: formatPreviewBytes(previewData.archivePreview.totalUncompressedSize)
              })}</span>
            </header>
            {previewData.archivePreview.truncated && (
              <p className="preview-archive-truncated">
                {t("preview.archiveTruncated", { count: previewData.archivePreview.entries.length })}
              </p>
            )}
            <div ref={archiveScrollRef} className="preview-archive-list cap-main-scroll-viewport" role="list">
              {previewData.archivePreview.entries.map((entry, index) => (
                <div className="preview-archive-entry" role="listitem" key={`${entry.path}:${index}`}>
                  <span className="preview-archive-entry-path" title={entry.path}>{entry.path}</span>
                  <span className="preview-archive-entry-size">
                    {entry.directory ? t("preview.archiveFolder") : formatPreviewBytes(entry.size ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : previewData.provider === "font" && previewData.fontPreview && !showInfoFallback ? (
          <FontPreviewPanel
            data={{ ...previewData, fontPreview: previewData.fontPreview }}
            onError={() => {
              setFontRuntimeFailed(true);
              setShowInfoFallback(true);
            }}
          />
        ) : previewData.provider === "epub" && previewData.epubPreview && !showInfoFallback ? (
          <section className="preview-epub-panel">
            <div ref={epubScrollRef} className="preview-epub-scroll cap-main-scroll-viewport">
              <header>
                {previewData.epubPreview.coverDataUrl && <img src={previewData.epubPreview.coverDataUrl} alt="" />}
                <div>
                  <h1>{previewData.epubPreview.title}</h1>
                  {previewData.epubPreview.creator && <p>{previewData.epubPreview.creator}</p>}
                </div>
              </header>
              {previewData.epubPreview.chapters.map((chapter, index) => (
                <article key={index}>
                  <h2>{chapter.title}</h2>
                  <pre>{chapter.text}</pre>
                </article>
              ))}
            </div>
          </section>
        ) : previewData.provider === "mobi" && previewData.mobiPreview && !showInfoFallback ? (
          <section className="preview-mobi-panel">
            <div ref={mobiScrollRef} className="preview-mobi-scroll cap-main-scroll-viewport">
              <header>
                {previewData.mobiPreview.coverDataUrl && <img src={previewData.mobiPreview.coverDataUrl} alt="" />}
                <div>
                  <h1>{previewData.mobiPreview.title}</h1>
                  {previewData.mobiPreview.creator && <p>{previewData.mobiPreview.creator}</p>}
                </div>
              </header>
              {previewData.mobiPreview.chapters.map((chapter, index) => (
                <article key={index}>
                  <h2>{chapter.title}</h2>
                  <pre>{chapter.text}</pre>
                </article>
              ))}
            </div>
          </section>
        ) : (previewData.provider === "audio" || previewData.provider === "video") && !showInfoFallback ? (
          previewData.provider === "audio" ? (
            <section className="preview-media-panel preview-audio-panel" data-preview-provider-interactive="true">
              <div className="preview-audio-identity">
                <SvgIcon svg={getFormatIconSvg(previewData.info?.extension ?? "")} className="cap-svg-icon preview-audio-format-icon" />
                <div>
                  <span>{previewInfoFormat}</span>
                  <strong>{previewData.fileName}</strong>
                </div>
              </div>
              <audio
                key={previewData.sessionId}
                ref={(element) => { mediaRef.current = element; }}
                src={previewData.previewUrl}
                controls
                autoPlay
                loop
                preload="metadata"
                onError={() => setShowInfoFallback(true)}
              />
            </section>
          ) : (
            <div className="preview-visual-with-metadata preview-video-canvas" data-preview-provider-interactive="true">
              <video
                key={previewData.sessionId}
                ref={(element) => { mediaRef.current = element; }}
                className="preview-video"
                src={previewData.previewUrl}
                controls
                autoPlay
                loop
                preload="metadata"
                onLoadedMetadata={(event) => {
                  if (event.currentTarget.videoWidth <= 0 || event.currentTarget.videoHeight <= 0) return;
                  window.cap7ce?.preview.contentSize({
                    sessionId: previewData.sessionId,
                    filePath: previewData.filePath,
                    width: event.currentTarget.videoWidth,
                    height: event.currentTarget.videoHeight,
                    sidebarWidth: previewSidebarWidth
                  });
                }}
                onError={() => setShowInfoFallback(true)}
              />
            </div>
          )
        ) : previewData.info && (
          <section className="preview-info-panel" data-preview-navigation-suppressed="true">
            <header className="preview-info-heading">
              <SvgIcon svg={previewData.info.kind === "folder" ? skimFolderSvg : getFormatIconSvg(previewData.info.extension)} className="cap-svg-icon preview-info-format-icon" />
              <div><span>{previewInfoFormat}</span><h1>{previewData.info.name}</h1></div>
            </header>
            {previewData.archiveFallbackReason && (
              <p className="preview-info-notice">{getArchiveFallbackMessage(previewData.archiveFallbackReason)}</p>
            )}
            {previewData.fontFallbackReason && (
              <p className="preview-info-notice">{getFontFallbackMessage(previewData.fontFallbackReason)}</p>
            )}
            {fontRuntimeFailed && !previewData.fontFallbackReason && (
              <p className="preview-info-notice">{getFontFallbackMessage("failed")}</p>
            )}
            {previewData.epubFallbackReason && <p className="preview-info-notice">{getEpubFallbackMessage(previewData.epubFallbackReason)}</p>}
            {previewData.mobiFallbackReason && <p className="preview-info-notice">{getMobiFallbackMessage(previewData.mobiFallbackReason)}</p>}
            <dl>
              <dt>{t("skim.previewPath")}</dt><dd>{previewData.info.path}</dd>
              <dt>{t("skim.previewType")}</dt><dd>{previewData.info.kind === "folder" ? t("skim.folder") : (previewData.info.extension || t("skim.file"))}</dd>
              <dt>{t("skim.previewModified")}</dt><dd>{new Date(previewData.info.modifiedAt).toLocaleString()}</dd>
              {previewData.info.kind === "file" && <><dt>{t("skim.previewSize")}</dt><dd>{formatPreviewBytes(previewData.info.size)}</dd></>}
              <dt>{t("skim.previewIndexedScope")}</dt><dd>{previewData.info.withinAddedDirectory ? t("common.yes") : t("common.no")}</dd>
              {previewData.info.kind === "folder" && folderStats && <>
                <dt>{t("skim.previewStatsStatus")}</dt><dd>{folderStatsStatus}</dd>
                <dt>{t("skim.previewFileCount")}</dt><dd>{folderStats.fileCount}</dd>
                <dt>{t("skim.previewFolderCount")}</dt><dd>{folderStats.folderCount}</dd>
                <dt>{t("skim.previewTotalSize")}</dt><dd>{formatPreviewBytes(folderStats.totalSize)}</dd>
                <dt>{t("skim.previewSkippedCount")}</dt><dd>{folderStats.skippedCount}</dd>
              </>}
            </dl>
          </section>
        )}
          </div>
      {(
        (previewData.provider === "text" && previewData.textPreview)
        || (previewData.provider === "pdf" && previewData.pdfPreview)
        || (previewData.provider === "archive" && previewData.archivePreview)
        || (previewData.provider === "epub" && previewData.epubPreview)
        || (previewData.provider === "mobi" && previewData.mobiPreview)
      ) && !showInfoFallback && (
        <div className="preview-window-scrollbar-slot">
          <CustomScrollbar
            scrollContainerRef={previewData.provider === "pdf"
              ? pdfScrollRef
              : previewData.provider === "archive"
                ? archiveScrollRef
              : previewData.provider === "epub"
                ? epubScrollRef
              : previewData.provider === "mobi"
                ? mobiScrollRef
                : textScrollRef}
            orientation="vertical"
          />
        </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default PreviewWindowApp;
