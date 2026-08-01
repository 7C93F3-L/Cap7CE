import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PreviewWindowControlState, PreviewWindowData, SkimFolderStats } from "../shared/types";
import CustomScrollbar from "./CustomScrollbar";
import ImageContextMenu, { getImageContextMenuStyle } from "./ImageContextMenu";
import WaitingIndicator from "./WaitingIndicator";
import WindowControlRail, { type WindowControlAction } from "./WindowControlRail";
import { setActiveLanguage, t } from "../../electron/localization";

const defaultPreviewWindowControlState: PreviewWindowControlState = {
  isMaximized: false,
  isAlwaysOnTop: false,
  miniStandardHeight: 500
};

const previewLoadingIndicatorDelayMs = 180;

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

const PreviewWindowApp = () => {
  const [previewData, setPreviewData] = useState<PreviewWindowData | null>(null);
  const [displaySrc, setDisplaySrc] = useState("");
  const [usingFallback, setUsingFallback] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [showInfoFallback, setShowInfoFallback] = useState(false);
  const [showPreviewLoadingIndicator, setShowPreviewLoadingIndicator] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const [windowControlState, setWindowControlState] = useState(defaultPreviewWindowControlState);
  const [folderStats, setFolderStats] = useState<SkimFolderStats | null>(null);
  const wheelThrottleRef = useRef(0);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const textScrollRef = useRef<HTMLPreElement | null>(null);
  const targetSessionIdRef = useRef("");
  const targetFilePathRef = useRef("");
  const previewLoadingIndicatorTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = window.imageEverything?.preview.onData((data) => {
      mediaRef.current?.pause();
      setActiveLanguage(data.language);
      setPreviewData(data);
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
        setContextMenu(null);
        void window.imageEverything?.preview.getWindowControlState().then(setWindowControlState);
        return;
      }
      previewLoadingIndicatorTimerRef.current = window.setTimeout(() => {
        if (targetSessionIdRef.current === data.sessionId) {
          setShowPreviewLoadingIndicator(true);
        }
        previewLoadingIndicatorTimerRef.current = null;
      }, previewLoadingIndicatorDelayMs);
      setContextMenu(null);
      void window.imageEverything?.preview.getWindowControlState().then(setWindowControlState);
    });
    window.imageEverything?.preview.requestData();
    return () => unsubscribe?.();
  }, []);

  useEffect(() => window.imageEverything?.skim.onFolderStats((update) => {
    if (targetSessionIdRef.current === update.sessionId && targetFilePathRef.current === update.path) {
      setFolderStats(update);
    }
  }), []);

  useEffect(() => {
    if (!previewData || ((!previewData.provider || previewData.provider === "image") && !showInfoFallback)) return;
    const infoDimensions = previewData.info?.kind === "folder"
      ? { width: 480, height: 360 }
      : { width: 480, height: 250 };
    const dimensions = showInfoFallback
      ? infoDimensions
      : previewData.provider === "video"
      ? { width: 960, height: 600 }
      : previewData.provider === "audio"
        ? { width: 640, height: 260 }
        : previewData.provider === "text"
          ? { width: 760, height: 600 }
          : infoDimensions;
    window.imageEverything?.preview.contentSize({
      sessionId: previewData.sessionId,
      filePath: previewData.filePath,
      ...dimensions
    });
  }, [previewData, showInfoFallback]);

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
      if (document.visibilityState !== "hidden") {
        return;
      }
      if (previewLoadingIndicatorTimerRef.current !== null) {
        window.clearTimeout(previewLoadingIndicatorTimerRef.current);
        previewLoadingIndicatorTimerRef.current = null;
      }
      targetSessionIdRef.current = "";
      targetFilePathRef.current = "";
      mediaRef.current?.pause();
      if (mediaRef.current) mediaRef.current.removeAttribute("src");
      setShowPreviewLoadingIndicator(false);
    };
    document.addEventListener("visibilitychange", resetPreviewSession);
    return () => {
      document.removeEventListener("visibilitychange", resetPreviewSession);
      if (previewLoadingIndicatorTimerRef.current !== null) {
        window.clearTimeout(previewLoadingIndicatorTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.imageEverything?.window.onAlwaysOnTopChanged?.((enabled) => {
      setWindowControlState((currentState) => ({
        ...currentState,
        isAlwaysOnTop: enabled
      }));
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const syncWindowControlState = () => {
      setViewportHeight(window.innerHeight);
      void window.imageEverything?.preview.getWindowControlState().then(setWindowControlState);
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
    window.imageEverything?.preview.contentSize({
      sessionId: previewData.sessionId,
      filePath: previewData.filePath,
      width: image.naturalWidth,
      height: image.naturalHeight
    });
  }, [displaySrc, previewData]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.key === "Escape") {
        event.preventDefault();
        mediaRef.current?.pause();
        void window.imageEverything?.preview.close();
        return;
      }
      if (mediaRef.current && document.activeElement === mediaRef.current) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        window.imageEverything?.preview.navigate(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        window.imageEverything?.preview.navigate(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const themeStyle = useMemo(() => {
    if (!previewData) {
      return {} as CSSProperties;
    }
    const isDark = previewData.theme === "dark";
    return {
      "--theme-color": previewData.appearanceColors.themeColor,
      "--accent-color": previewData.appearanceColors.accentColor,
      "--app-bg": isDark ? "#191919" : "#ffffff",
      "--panel-bg": isDark ? "#282828" : "#f2f2f2",
      "--text-main": isDark ? "#b2b2b2" : "#111111",
      "--icon-muted": isDark ? "#4f4f4f" : "#777777",
      "--border-soft": isDark ? "#2a2a2a" : "#ececec"
    } as CSSProperties;
  }, [previewData]);

  const closePreview = () => {
    mediaRef.current?.pause();
    if (previewData?.provider === "folderInfo") {
      void window.imageEverything?.skim.cancelFolderStats(previewData.sessionId);
    }
    void window.imageEverything?.preview.close();
  };

  const previewControlActions: WindowControlAction[] = [
    { id: "close", label: t("preview.close"), icon: "line", onClick: closePreview },
    {
      id: "maximize",
      label: windowControlState.isMaximized ? t("preview.restore") : t("preview.maximize"),
      icon: "expand",
      pressed: windowControlState.isMaximized,
      onClick: () => {
        void window.imageEverything?.preview.toggleMaximized().then(setWindowControlState);
      }
    },
    {
      id: "pin",
      label: windowControlState.isAlwaysOnTop ? t("preview.unpin") : t("preview.pin"),
      icon: windowControlState.isAlwaysOnTop ? "pinOn" : "pinOff",
      pressed: windowControlState.isAlwaysOnTop,
      onClick: () => {
        void window.imageEverything?.preview.toggleAlwaysOnTop().then(setWindowControlState);
      }
    }
  ];
  const showSettings = viewportHeight >= windowControlState.miniStandardHeight;

  if (!previewData) {
    return <main className="preview-window-root" />;
  }
  const isImageProvider = (!previewData.provider || previewData.provider === "image") && !showInfoFallback;
  const folderStatsStatus = folderStats?.status === "completed"
    ? t("skim.previewStats.completed")
    : folderStats?.status === "cancelled"
      ? t("skim.previewStats.cancelled")
      : t("skim.previewStats.scanning");

  return (
    <main
      className={`app theme-${previewData.theme} preview-window-root`}
      style={themeStyle}
      role="dialog"
      aria-label={previewData.fileName}
      onClick={() => setContextMenu(null)}
      onContextMenu={(event) => {
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY });
      }}
      onWheelCapture={(event) => {
        if (event.target instanceof HTMLElement && event.target.closest(".preview-text-panel")) return;
        event.preventDefault();
        setContextMenu(null);
        const now = window.performance.now();
        if (now - wheelThrottleRef.current < 200) {
          return;
        }
        wheelThrottleRef.current = now;
        window.imageEverything?.preview.navigate(event.deltaY > 0 ? 1 : -1);
      }}
    >
      <div className="preview-window-content">
        {showPreviewLoadingIndicator && (
          <div className="preview-window-loading" role="status" aria-live="polite">
            <WaitingIndicator className="preview-window-waiting-icon" />
            <span>{t("preview.loading")}</span>
          </div>
        )}
        {isImageProvider ? <img
          key={`${previewData.sessionId}:${displaySrc}`}
          ref={imageRef}
          className={`preview-window-image${isPreviewLoading ? " is-loading" : ""}`}
          src={displaySrc}
          alt={previewData.fileName}
          draggable={false}
          onLoad={(event) => {
            if (previewLoadingIndicatorTimerRef.current !== null) {
              window.clearTimeout(previewLoadingIndicatorTimerRef.current);
              previewLoadingIndicatorTimerRef.current = null;
            }
            setShowPreviewLoadingIndicator(false);
            setIsPreviewLoading(false);
            window.imageEverything?.preview.contentSize({
              sessionId: previewData.sessionId,
              filePath: previewData.filePath,
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight
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
            window.imageEverything?.preview.contentSize({
              sessionId: previewData.sessionId,
              filePath: previewData.filePath,
              width: 1,
              height: 1
            });
          }}
          onClick={(event) => {
            event.stopPropagation();
            setContextMenu(null);
          }}
        /> : previewData.provider === "text" && previewData.textPreview && !showInfoFallback ? (
          <section className="preview-text-panel">
            <header>
              <strong>{previewData.fileName}</strong>
              <span>{previewData.textPreview.encoding}{previewData.textPreview.truncated ? ` · ${t("preview.textTruncated")}` : ""}</span>
            </header>
            <pre ref={textScrollRef} className="cap-main-scroll-viewport">{previewData.textPreview.content}</pre>
          </section>
        ) : (previewData.provider === "audio" || previewData.provider === "video") && !showInfoFallback ? (
          previewData.provider === "audio" ? (
            <section className="preview-media-panel preview-audio-panel">
              <strong>{previewData.fileName}</strong>
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
            <video
              key={previewData.sessionId}
              ref={(element) => { mediaRef.current = element; }}
              className="preview-video"
              src={previewData.previewUrl}
              controls
              autoPlay
              loop
              preload="metadata"
              onError={() => setShowInfoFallback(true)}
            />
          )
        ) : previewData.info && (
          <section className="preview-info-panel">
            <h1>{previewData.info.name}</h1>
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
      {previewData.provider === "text" && previewData.textPreview && !showInfoFallback && (
        <div className="preview-window-scrollbar-slot">
          <CustomScrollbar scrollContainerRef={textScrollRef} orientation="vertical" />
        </div>
      )}
      <WindowControlRail
        actions={previewControlActions}
        showSkim={showSettings}
        skimActive={previewData.skimActive}
        onSkim={() => { void window.imageEverything?.preview.toggleSkim(); }}
        showSettings={showSettings}
        settingsLabel={t("window.openSettings")}
        onSettings={() => { void window.imageEverything?.preview.openSettings(); }}
      />
      {contextMenu && (
        <ImageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          theme={previewData.theme}
          menuStyle={getImageContextMenuStyle(previewData.theme, previewData.appearanceColors)}
          primaryActionLabel={t("preview.close")}
          onPrimaryAction={() => {
            setContextMenu(null);
            closePreview();
          }}
          onOpen={async () => {
            setContextMenu(null);
            const result = await window.imageEverything?.files.open(previewData.filePath);
            if (result === "") {
              closePreview();
            }
          }}
          onShowInFolder={() => {
            setContextMenu(null);
            void window.imageEverything?.files.showInFolder(previewData.filePath);
          }}
          onEditKeywords={() => {
            setContextMenu(null);
            void window.imageEverything?.preview.requestItemAction({
              action: "editKeywords",
              itemId: previewData.itemId,
              filePath: previewData.filePath
            });
          }}
          onDeleteFile={() => {
            setContextMenu(null);
            void window.imageEverything?.preview.requestItemAction({
              action: "deleteFile",
              itemId: previewData.itemId,
              filePath: previewData.filePath
            });
          }}
          showEditKeywords={!previewData.provider}
          showDelete={!previewData.provider}
        />
      )}
    </main>
  );
};

export default PreviewWindowApp;
