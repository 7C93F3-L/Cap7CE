import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject
} from "react";
import type React from "react";
import skimDiskSvg from "../assets/icons/skim-disk.svg?raw";
import skimFolderSvg from "../assets/icons/skim-folder.svg?raw";
import skimStarredFolderSvg from "../assets/icons/skim-location-starred-folder.svg?raw";
import { MiddleEllipsisFileName, TwoLineMiddleEllipsisFileName } from "../components/MiddleEllipsisFileName";
import SvgIcon from "../components/SvgIcon";
import CustomScrollbar from "../CustomScrollbar";
import ResponsiveSkimContextMenuLayer from "./ResponsiveSkimContextMenuLayer";
import SkimRootSections from "./SkimRootSections";
import { useSkimKeyboardSelection } from "./useSkimKeyboardSelection";
import { resolveFileContentPreview } from "../contentPreview";
import { getDirectoryPath, isWindowsRootPath, normalizeWindowsPathKey } from "../filePath";
import { formatDisplayMessage } from "../formatting";
import { getFormatIconSvgByName } from "../formatIcons";
import { copyFilePathsWithFeedback, getFileContextShortcutAction } from "../fileContextActions";
import { isEditableKeyboardTarget } from "../keyboardTarget";
import { createPreviewRequestGuard } from "../previewRequestGuard";
import {
  getImageGridLayout,
  getResultLayoutMode,
  imageGridGap,
  imageGridOverscanItems,
  imageGridOverscanRows
} from "../virtualGridLayout";
import type {
  AppearanceColors,
  PreviewWindowData,
  ResolvedThemeMode,
  SkimBrowseEntry,
  SkimLocationShortcut,
  SkimPreviewInfo,
  WindowMaterial
} from "../../shared/types";
import { getActiveLanguage, t } from "../../../electron/localization";
import type { FileContextMenuAction } from "../../shared/fileContextMenuTypes";
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
  visualSessionId: string;
  entries: SkimBrowseEntry[];
  currentPath: string | null;
  isLoading: boolean;
  theme: ResolvedThemeMode;
  appearanceColors: AppearanceColors;
  windowMaterial: WindowMaterial;
  isAddingDirectory: boolean;
  onOpenBreadcrumb: (path: string) => void;
  onOpenEntry: (entry: SkimBrowseEntry) => void;
  onAddEntries: (entries: SkimBrowseEntry[]) => void;
  sidebarFolderPaths: string[];
  sidebarKnownPaths: string[];
  onAddSidebarFolders: (folderPaths: string[]) => void;
  onRemoveSidebarFolders: (folderPaths: string[]) => void;
  rootLocations: SkimLocationShortcut[];
  systemLocationsCollapsed: boolean;
  onToggleSystemLocations: () => void;
  onFeedback: (message: string) => void;
  onNativeDragStateChange: (active: boolean) => void;
  active?: boolean;
}

export type SkimContextMenuState = { x: number; y: number; item: SkimBrowseEntry; items: SkimBrowseEntry[] }; const responsiveSkimGridTargetThumbSize = 120;

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

export const SkimView = ({ visualSessionId, entries, currentPath, isLoading, theme, appearanceColors, windowMaterial, isAddingDirectory, onOpenBreadcrumb, onOpenEntry, onAddEntries, sidebarFolderPaths, sidebarKnownPaths, onAddSidebarFolders, onRemoveSidebarFolders, rootLocations, systemLocationsCollapsed, onToggleSystemLocations, onFeedback, onNativeDragStateChange, active = true }: SkimViewProps) => {
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
  const [lowHeightLayout, setLowHeightLayout] = useState(() => window.matchMedia("(max-height: 359.98px)").matches);
  const [rootStarredCollapsed, setRootStarredCollapsed] = useState(false);
  const [rootDrivesCollapsed, setRootDrivesCollapsed] = useState(false);
  const selectionAnchorPathRef = useRef<string | null>(null);
  const previewEntryPathRef = useRef<string | null>(null);
  const previewSessionCounterRef = useRef(0);
  const previewRequestGuard = useMemo(() => createPreviewRequestGuard(), []);
  const layoutShellState = lowHeightLayout ? "micro" : "normal";
  const isHorizontalGrid = layoutShellState === "micro";
  const gridTargetThumbSize = responsiveSkimGridTargetThumbSize; const gridLayout = getImageGridLayout(getResultLayoutMode(layoutShellState), gridViewport.width, gridViewport.height, { targetThumbSize: gridTargetThumbSize });
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
  const contextMenuRemovableSidebarFolderPaths = useMemo(
    () => contextMenuSidebarFolderPaths.filter((folderPath) => sidebarFolderPathKeys.has(normalizeWindowsPathKey(folderPath))),
    [contextMenuSidebarFolderPaths, sidebarFolderPathKeys]
  );
  const contextMenuSidebarAction = contextMenuMissingSidebarFolderPaths.length > 0
    ? "add"
    : contextMenuRemovableSidebarFolderPaths.length > 0
      ? "remove"
      : "unavailable";
  const clearSelection = useCallback(() => {
    const focusedElement = document.activeElement;
    if (focusedElement instanceof HTMLElement && focusedElement.closest('[data-skim-view="true"] button')) focusedElement.blur();
    setSelectedPaths(new Set()); setActivePath(null); selectionAnchorPathRef.current = null;
  }, []);
  const getEntryIcon = (entry: SkimBrowseEntry) => {
    if (entry.kind === "drive") return skimDiskSvg;
    if (entry.kind === "folder") {
      return sidebarFolderPathKeys.has(normalizeWindowsPathKey(entry.path)) ? skimStarredFolderSvg : skimFolderSvg;
    }
    return getFormatIconSvgByName(entry.formatCapability?.iconName);
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-height: 359.98px)");
    const updateLayout = () => setLowHeightLayout(mediaQuery.matches);
    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);
    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => { clearSelection(); setContextMenu(null); }, [clearSelection, currentPath]);

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

  const selectKeyboardEntry = useCallback((entry: SkimBrowseEntry) => selectEntry(entry, false, false), [selectEntry]);

  const selectRootPath = useCallback((path: string) => {
    setSelectedPaths(new Set([path]));
    setActivePath(path);
    selectionAnchorPathRef.current = path;
    setContextMenu(null);
  }, []);

  useSkimKeyboardSelection({ active, currentPath, entries, rootLocations, systemLocationsCollapsed, starredLocationsCollapsed: rootStarredCollapsed, drivesCollapsed: rootDrivesCollapsed,
    activePath, selectedPathCount: selectedPaths.size, contextMenuOpen: contextMenu !== null,
    columnCount: gridLayout.columnCount, cellSize: gridLayout.cellSize, horizontal: isHorizontalGrid, scrollContainerRef,
    onSelectEntry: selectKeyboardEntry, onSelectRootPath: selectRootPath, onClearSelection: clearSelection });

  const openRootLocationContextMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>, location: SkimLocationShortcut) => {
    if (!location.path) return;
    event.preventDefault();
    event.stopPropagation();
    const entry: SkimBrowseEntry = {
      kind: "folder",
      name: location.name?.trim() || t("skim.locationPicker.starred"),
      path: location.path,
      extension: "",
      size: null,
      modifiedAt: null,
      withinAddedDirectory: false,
      hidden: false,
      status: "ready"
    };
    selectRootPath(location.path);
    setContextMenu({ x: event.clientX, y: event.clientY, item: entry, items: [entry] });
  }, [selectRootPath]);

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

  const handleContextMenuAction = (action: FileContextMenuAction) => {
    if (!contextMenu) return;
    setContextMenu(null);
    if (action === "preview") void openPreview(contextMenu.item);
    else if (action === "open") openEntry(contextMenu.item);
    else if (action === "showInFolder") showEntryInFolder(contextMenu.item, contextMenu.items.length);
    else if (action === "copyPaths") void copyFilePathsWithFeedback(contextMenu.items.map((entry) => entry.path), t("clipboard.copied"), onFeedback);
    else if (action === "addDirectory" && !isAddingDirectory) onAddEntries(contextMenu.items);
    else if (action === "addToSidebar" && contextMenuSidebarAction === "add") onAddSidebarFolders(contextMenuMissingSidebarFolderPaths);
    else if (action === "addToSidebar" && contextMenuSidebarAction === "remove") onRemoveSidebarFolders(contextMenuRemovableSidebarFolderPaths);
  };

  useEffect(() => {
    if (!active) return undefined;
    const handleSelectionKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if (contextMenu) {
        if (event.key === "Escape") { event.preventDefault(); setContextMenu(null); }
        return;
      }

      const actionableEntries = selectedEntries.filter((entry) => entry.kind !== "drive");
      const activeEntry = entries.find((entry) => entry.path === activePath && entry.kind !== "drive");
      const fileShortcutAction = getFileContextShortcutAction(event);

      if (fileShortcutAction === "copyPaths" && actionableEntries.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) void copyFilePathsWithFeedback(actionableEntries.map((entry) => entry.path), t("clipboard.copied"), onFeedback);
        return;
      }

      if (fileShortcutAction === "showInFolder" && activeEntry) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) showEntryInFolder(activeEntry, 1);
        return;
      }

      if (fileShortcutAction === "addDirectory" && actionableEntries.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat && !isAddingDirectory) onAddEntries(actionableEntries);
        return;
      }

      if (fileShortcutAction === "addToSidebar" && actionableEntries.length > 0) {
        const sidebarFolderPaths = deriveSkimSidebarFolderPaths(actionableEntries);
        const missingSidebarFolderPaths = sidebarFolderPaths.filter(
          (folderPath) => !sidebarKnownPathKeys.has(normalizeWindowsPathKey(folderPath))
        );
        const removableSidebarFolderPaths = sidebarFolderPaths.filter(
          (folderPath) => sidebarFolderPathKeys.has(normalizeWindowsPathKey(folderPath))
        );
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat && missingSidebarFolderPaths.length > 0) {
          onAddSidebarFolders(missingSidebarFolderPaths);
        } else if (!event.repeat && removableSidebarFolderPaths.length > 0) {
          onRemoveSidebarFolders(removableSidebarFolderPaths);
        }
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

    };
    window.addEventListener("keydown", handleSelectionKeyDown);
    return () => window.removeEventListener("keydown", handleSelectionKeyDown);
  }, [active, activePath, contextMenu, entries, isAddingDirectory, onAddEntries, onAddSidebarFolders, onFeedback, onRemoveSidebarFolders, selectedEntries, selectedPaths, showEntryInFolder, sidebarFolderPathKeys, sidebarKnownPathKeys]);

  return (
    <main
      className={`skim-view cap-skim-view is-embedded${isHorizontalGrid ? " is-horizontal" : ""}`}
      data-skim-view="true"
      style={{
        "--cap-grid-target-size": `${gridTargetThumbSize}px`,
        "--cap-grid-gap": `${imageGridGap}px`
      } as CSSProperties}
      onClick={() => { setContextMenu(null); clearSelection(); }}
    >
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
          {currentPath === null ? <SkimRootSections
            drives={entries.filter((entry) => entry.kind === "drive")}
            locations={rootLocations}
            systemLocationsCollapsed={systemLocationsCollapsed}
            starredLocationsCollapsed={rootStarredCollapsed}
            drivesCollapsed={rootDrivesCollapsed}
            selectedPath={activePath}
            onSelectPath={selectRootPath}
            onOpenPath={onOpenBreadcrumb}
            onToggleSystemLocations={onToggleSystemLocations}
            onToggleStarredLocations={() => setRootStarredCollapsed((current) => !current)}
            onToggleDrives={() => setRootDrivesCollapsed((current) => !current)}
            onStarredContextMenu={openRootLocationContextMenu}
          /> : <>
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
          </>}
        </section>
        <CustomScrollbar scrollContainerRef={scrollContainerRef} orientation={isHorizontalGrid ? "horizontal" : "vertical"} />
      </div>
      {contextMenu && (
        <ResponsiveSkimContextMenuLayer
          key={`skim:${contextMenu.item.path}:${contextMenu.x}:${contextMenu.y}`}
          state={contextMenu} theme={theme} appearanceColors={appearanceColors} windowMaterial={windowMaterial}
          isAddingDirectory={isAddingDirectory} sidebarAction={contextMenuSidebarAction}
          onClose={() => setContextMenu(null)}
          onAction={handleContextMenuAction}
        />
      )}
    </main>
  );
};
