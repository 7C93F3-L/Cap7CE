import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
  type RefObject
} from "react";
import type React from "react";
import skimDiskSvg from "../assets/icons/skim-disk.svg?raw";
import skimFolderSvg from "../assets/icons/skim-folder.svg?raw";
import skimStarredFolderSvg from "../assets/icons/skim-location-starred-folder.svg?raw";
import { MiddleEllipsisFileName, TwoLineMiddleEllipsisFileName } from "../components/MiddleEllipsisFileName";
import SvgIcon from "../components/SvgIcon";
import { Cap7CESearchCapsule, type SearchCapsuleLabelVisibility } from "../search/Cap7CESearchCapsule";
import CustomScrollbar from "../CustomScrollbar";
import ImageContextMenu, { getImageContextMenuStyle } from "../ImageContextMenu";
import { resolveFileContentPreview } from "../contentPreview";
import { getDirectoryPath, isWindowsRootPath, normalizeWindowsPathKey } from "../filePath";
import { formatCacheSize, formatDisplayMessage } from "../formatting";
import { getFormatIconSvgByName } from "../formatIcons";
import { isEditableKeyboardTarget } from "../keyboardTarget";
import { createPreviewRequestGuard } from "../previewRequestGuard";
import {
  getImageGridLayout,
  getResultLayoutMode,
  imageGridGap,
  imageGridOverscanItems,
  imageGridOverscanRows,
  imageGridTargetThumbSize
} from "../virtualGridLayout";
import type {
  AppearanceColors,
  PreviewWindowData,
  ResolvedThemeMode,
  SearchState,
  SkimBreadcrumb,
  SkimBrowseEntry,
  SkimDisplayMode,
  SkimFolderStats,
  SkimPreviewInfo
} from "../../shared/types";
import { getActiveLanguage, t } from "../../../electron/localization";

export type SkimShellState = "standby" | "capsule" | "micro" | "mini" | "normal" | "settings";

const deriveSkimSidebarFolderPaths = (entries: SkimBrowseEntry[]) => {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const entry of entries) {
    const folderPath = entry.kind === "folder" ? entry.path : getDirectoryPath(entry.path);
    const key = normalizeWindowsPathKey(folderPath);
    if (!key || isWindowsRootPath(folderPath) || seen.has(key)) continue;
    seen.add(key);
    paths.push(folderPath);
  }
  return paths;
};

export interface SkimViewProps {
  search: SearchState;
  visualSessionId: string;
  entries: SkimBrowseEntry[];
  currentPath: string | null;
  breadcrumbs: SkimBreadcrumb[];
  isLoading: boolean;
  feedback: string;
  theme: ResolvedThemeMode;
  appearanceColors: AppearanceColors;
  shellState: SkimShellState;
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
  sidebarFolderPaths: string[];
  sidebarKnownPaths: string[];
  onAddSidebarFolders: (folderPaths: string[]) => void;
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

export const SkimView = ({ search, visualSessionId, entries, currentPath, breadcrumbs, isLoading, feedback, theme, appearanceColors, shellState, isAddingDirectory, inputFeedback, inputFeedbackIsGuide, labelVisibility, skimDisplayMode, searchInputRef, onSearchChange, onSearchOptionsChange, onLabelVisibilityChange, onSkimDisplayModeChange, onSearch, onOpenRoot, onOpenBreadcrumb, onOpenEntry, onAddEntries, sidebarFolderPaths, sidebarKnownPaths, onAddSidebarFolders, onFeedback, onNativeDragStateChange }: SkimViewProps) => {
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
  const sidebarFolderPathKeys = useMemo(
    () => new Set(sidebarFolderPaths.map(normalizeWindowsPathKey)),
    [sidebarFolderPaths]
  );
  const sidebarKnownPathKeys = useMemo(
    () => new Set(sidebarKnownPaths.map(normalizeWindowsPathKey)),
    [sidebarKnownPaths]
  );
  const contextMenuSidebarFolderPaths = useMemo(
    () => deriveSkimSidebarFolderPaths(contextMenu?.items ?? []),
    [contextMenu?.items]
  );
  const contextMenuMissingSidebarFolderPaths = useMemo(
    () => contextMenuSidebarFolderPaths.filter((folderPath) => !sidebarKnownPathKeys.has(normalizeWindowsPathKey(folderPath))),
    [contextMenuSidebarFolderPaths, sidebarKnownPathKeys]
  );
  const getEntryIcon = (entry: SkimBrowseEntry) => {
    if (entry.kind === "drive") return skimDiskSvg;
    if (entry.kind === "folder") {
      return sidebarFolderPathKeys.has(normalizeWindowsPathKey(entry.path)) ? skimStarredFolderSvg : skimFolderSvg;
    }
    return getFormatIconSvgByName(entry.formatCapability?.iconName);
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
        void window.cap7ce?.skim.readFileInfoFolderStats({ taskId: folderTaskId, path: entry.path })
          .then((stats) => {
            if (active && stats?.status === "completed") setFileInfoFolderStats(stats);
          });
      }, 300);
    } else if (entry.kind === "file" && entry.formatCapability?.previewKind === "image") {
      void window.cap7ce?.skim.readFileInfoDimensions(entry.path).then((dimensions) => {
        if (active) setFileInfoDimensions(dimensions ?? null);
      });
    }

    return () => {
      active = false;
      if (folderTimer !== null) window.clearTimeout(folderTimer);
      if (folderTaskId) void window.cap7ce?.skim.cancelFileInfoFolderStats(folderTaskId);
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
    const result = await window.cap7ce?.files.open(targetPath);
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
      const info: SkimPreviewInfo | undefined = await window.cap7ce?.skim.inspect({
        path: entry.path,
        kind: entry.kind
      });
      if (!info || !previewRequestGuard.isCurrent(openRequestId)) return;
      const sessionId = `skim:${Date.now()}:${++previewSessionCounterRef.current}`;
      const imageProviderAvailable = entry.kind === "file"
        && entry.formatCapability?.previewKind === "image"
        && (entry.formatCapability.canThumbnail || entry.formatCapability.canShellPreview)
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
        modifiedAt: info.modifiedAt,
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
      const opened = await window.cap7ce?.preview.open(previewData);
      if (opened && provider === "folderInfo") {
        void window.cap7ce?.skim.startFolderStats({ sessionId, path: entry.path });
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
    const unsubscribeNavigate = window.cap7ce?.preview.onNavigate(movePreview);
    const unsubscribeClosed = window.cap7ce?.preview.onClosed(() => {
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
      void window.cap7ce?.files.showInFolder(item.path);
    }
  }, [currentPath, openSystemPath]);

  useEffect(() => {
    const handleSelectionKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if (contextMenu) {
        if (event.key === "Escape") setContextMenu(null);
        return;
      }

      const actionableEntries = selectedEntries.filter((entry) => entry.kind !== "drive");
      const activeEntry = entries.find((entry) => entry.path === activePath && entry.kind !== "drive");

      if (event.ctrlKey && event.shiftKey && !event.altKey && event.code === "KeyC" && actionableEntries.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) void window.cap7ce?.files.copyPaths(actionableEntries.map((entry) => entry.path));
        return;
      }

      if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key === "Enter" && activeEntry) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) showEntryInFolder(activeEntry, 1);
        return;
      }

      if (event.ctrlKey && !event.altKey && !event.shiftKey && event.code === "KeyC") {
        if (actionableEntries.length === 0) return;
        event.preventDefault();
        if (event.repeat) return;
        void window.cap7ce?.files.copyItems(actionableEntries.map((entry) => entry.path)).then((copiedCount) => {
          onFeedback(copiedCount > 0
            ? t("clipboard.itemsCopied", { count: copiedCount })
            : t("clipboard.copyFailed"));
        }).catch(() => onFeedback(t("clipboard.copyFailed")));
        return;
      }

      if (event.key !== "Escape" || selectedPaths.size === 0) return;
      setSelectedPaths(new Set());
      setActivePath(null);
      selectionAnchorPathRef.current = null;
    };
    window.addEventListener("keydown", handleSelectionKeyDown);
    return () => window.removeEventListener("keydown", handleSelectionKeyDown);
  }, [activePath, contextMenu, entries, onFeedback, selectedEntries, selectedPaths, showEntryInFolder]);

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
                      window.cap7ce?.files.startDrag(dragEntries.map((candidate) => candidate.path));
                    }}
                    onDragEnd={() => onNativeDragStateChange(false)}
                    onKeyDown={(event) => {
                      if (!isLoading && event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.shiftKey) {
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
            filePath: contextMenu.item.path,
            sourceFileName: contextMenu.item.name,
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
                { id: "preview", label: t("skim.preview"), shortcut: "Space", onSelect: () => void openPreview(contextMenu.item) },
                { id: "open", label: t("skim.openItem"), shortcut: "Enter", onSelect: () => openEntry(contextMenu.item) },
                { id: "showInFolder", label: t("skim.openPath"), shortcut: "Ctrl+Enter", onSelect: () => showEntryInFolder(contextMenu.item, contextMenu.items.length) }
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
                  shortcut: "Ctrl+Shift+C",
                  onSelect: () => {
                    setContextMenu(null);
                    void window.cap7ce?.files.copyPaths(contextMenu.items.map((entry) => entry.path));
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
                },
                {
                  id: "addToSidebar",
                  label: contextMenuSidebarFolderPaths.length > 0 && contextMenuMissingSidebarFolderPaths.length === 0
                    ? t("skim.sidebar.alreadyAdded")
                    : t("skim.sidebar.add"),
                  disabled: contextMenuSidebarFolderPaths.length === 0 || contextMenuMissingSidebarFolderPaths.length === 0,
                  onSelect: () => {
                    setContextMenu(null);
                    if (contextMenuMissingSidebarFolderPaths.length > 0) {
                      onAddSidebarFolders(contextMenuMissingSidebarFolderPaths);
                    }
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
