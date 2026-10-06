import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ComputerSearchAuthorization, ComputerSearchItem } from "../../../electron/computerSearchTypes";
import { getActiveLanguage, t } from "../../../electron/localization";
import type { AppearanceColors, PreviewWindowData, ResolvedThemeMode } from "../../shared/types";
import { getFileContextShortcutAction } from "../fileContextActions";
import { isEditableKeyboardTarget, isWorkspaceControlKeyboardTarget } from "../keyboardTarget";
import type { ComputerSearchContextMenuState } from "./ComputerSearchResultContextMenu";

interface ResultActionOptions {
  items: ComputerSearchItem[];
  taskId: string;
  theme: ResolvedThemeMode;
  appearanceColors: AppearanceColors;
  onNativeDragStateChange: (active: boolean) => void;
  foreground?: boolean;
  onOpenDirectory?: (path: string) => void;
}

export const useComputerSearchResultActions = ({
  items, taskId, theme, appearanceColors, onNativeDragStateChange, foreground = true, onOpenDirectory
}: ResultActionOptions) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ComputerSearchContextMenuState | null>(null);
  const [feedback, setFeedback] = useState("");
  const selectionAnchorRef = useRef<string | null>(null);
  const previewAuthorizationRef = useRef<string | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => { setFeedback(""); feedbackTimerRef.current = null; }, 1800);
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
    setActiveId(null);
    setContextMenu(null);
    selectionAnchorRef.current = null;
    previewAuthorizationRef.current = null;
  }, [taskId]);
  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.authorizationId)),
    [items, selectedIds]
  );
  const authorization = useCallback((item: ComputerSearchItem): ComputerSearchAuthorization => ({
    taskId,
    authorizationId: item.authorizationId
  }), [taskId]);

  const selectItem = useCallback((item: ComputerSearchItem, additive: boolean, range: boolean) => {
    if (range && selectionAnchorRef.current) {
      const anchorIndex = items.findIndex((candidate) => candidate.authorizationId === selectionAnchorRef.current);
      const targetIndex = items.findIndex((candidate) => candidate.authorizationId === item.authorizationId);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const ids = items.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
          .map((candidate) => candidate.authorizationId);
        setSelectedIds((current) => new Set(additive ? [...current, ...ids] : ids));
        setActiveId(item.authorizationId);
        return;
      }
    }
    setSelectedIds((current) => {
      if (!additive) return new Set([item.authorizationId]);
      const next = new Set(current);
      if (next.has(item.authorizationId)) next.delete(item.authorizationId);
      else next.add(item.authorizationId);
      return next;
    });
    setActiveId(item.authorizationId);
    selectionAnchorRef.current = item.authorizationId;
  }, [items]);

  const openItem = useCallback((item: ComputerSearchItem) => {
    if (item.isDirectory && onOpenDirectory) { onOpenDirectory(item.path); return; }
    void window.cap7ce?.computerSearch.open(authorization(item)).then((message) => {
      if (message) showFeedback(t("computerSearch.actionFailed"));
    }, () => showFeedback(t("computerSearch.actionFailed")));
  }, [authorization, showFeedback, onOpenDirectory]);

  const showInFolder = useCallback((item: ComputerSearchItem) => {
    void window.cap7ce?.computerSearch.showInFolder(authorization(item)).catch(() => {
      showFeedback(t("computerSearch.actionFailed"));
    });
  }, [authorization, showFeedback]);

  const copyPaths = useCallback((targets: ComputerSearchItem[]) => {
    if (targets.length === 0) return;
    void window.cap7ce?.computerSearch.copyPaths({
      taskId,
      authorizationIds: targets.slice(0, 200).map((item) => item.authorizationId)
    }).then((count) => {
      if (count > 0) showFeedback(t("clipboard.copied"));
    }, () => showFeedback(t("computerSearch.actionFailed")));
  }, [showFeedback, taskId]);

  const openPreview = useCallback(async (item: ComputerSearchItem) => {
    const request = authorization(item);
    try {
      const info = await window.cap7ce?.computerSearch.inspect(request);
      if (!info) return;
      let provider: PreviewWindowData["provider"] = item.isDirectory ? "folderInfo" : item.previewKind;
      let textPreview;
      if (provider === "text") {
        try { textPreview = await window.cap7ce?.computerSearch.readTextPreview(request); }
        catch { provider = "fileInfo"; }
      }
      const sessionId = `computer-search:${Date.now()}:${item.authorizationId.slice(0, 8)}`;
      const data: PreviewWindowData = {
        sessionId,
        itemId: item.authorizationId,
        filePath: info.path,
        fileName: info.name,
        fileSize: info.size,
        modifiedAt: info.modifiedAt,
        previewUrl: "",
        thumbnailUrl: "",
        provider,
        info,
        textPreview,
        skimActive: true,
        theme,
        language: getActiveLanguage(),
        appearanceColors,
        sourceAuthorization: { kind: "computer-search", ...request }
      };
      previewAuthorizationRef.current = item.authorizationId;
      const opened = await window.cap7ce?.preview.open(data);
      if (!opened) showFeedback(t("computerSearch.actionFailed"));
    } catch {
      showFeedback(t("computerSearch.actionFailed"));
    }
  }, [appearanceColors, authorization, showFeedback, theme]);

  useEffect(() => {
    const unsubscribeNavigate = window.cap7ce?.preview.onNavigate((direction) => {
      const currentIndex = items.findIndex((item) => item.authorizationId === previewAuthorizationRef.current);
      const nextItem = items[Math.min(items.length - 1, Math.max(0, currentIndex + direction))];
      if (currentIndex < 0 || !nextItem || nextItem.authorizationId === previewAuthorizationRef.current) return;
      setSelectedIds(new Set([nextItem.authorizationId]));
      setActiveId(nextItem.authorizationId);
      selectionAnchorRef.current = nextItem.authorizationId;
      void openPreview(nextItem);
    });
    const unsubscribeClosed = window.cap7ce?.preview.onClosed(() => { previewAuthorizationRef.current = null; });
    return () => { unsubscribeNavigate?.(); unsubscribeClosed?.(); };
  }, [items, openPreview]);

  const openContextMenu = useCallback((event: ReactMouseEvent, item: ComputerSearchItem) => {
    event.preventDefault();
    const ids = selectedIds.has(item.authorizationId) ? selectedIds : new Set([item.authorizationId]);
    if (!selectedIds.has(item.authorizationId)) setSelectedIds(ids);
    setActiveId(item.authorizationId);
    selectionAnchorRef.current = item.authorizationId;
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      item,
      items: items.filter((candidate) => ids.has(candidate.authorizationId))
    });
  }, [items, selectedIds]);

  const handleContextMenuAction = useCallback((action: "preview" | "open" | "showInFolder" | "copyPaths") => {
    if (!contextMenu) return;
    const { item, items: targets } = contextMenu;
    setContextMenu(null);
    if (action === "preview") void openPreview(item);
    else if (action === "open") openItem(item);
    else if (action === "showInFolder") showInFolder(item);
    else copyPaths(targets);
  }, [contextMenu, copyPaths, openItem, openPreview, showInFolder]);

  const startDrag = useCallback((item: ComputerSearchItem) => {
    const targets = selectedIds.has(item.authorizationId) ? selectedItems : [item];
    onNativeDragStateChange(true);
    window.cap7ce?.computerSearch.startDrag({
      taskId,
      authorizationIds: targets.slice(0, 200).map((target) => target.authorizationId)
    });
  }, [onNativeDragStateChange, selectedIds, selectedItems, taskId]);

  useEffect(() => {
    if (!foreground) setContextMenu(null);
  }, [foreground]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!foreground) return;
      if (isEditableKeyboardTarget(event.target) || isWorkspaceControlKeyboardTarget(event.target)) return;
      if (contextMenu) {
        if (event.key === "Escape") { event.preventDefault(); setContextMenu(null); }
        return;
      }
      const activeItem = items.find((item) => item.authorizationId === activeId) ?? selectedItems[0];
      if (event.code === "Space" && activeItem) {
        event.preventDefault();
        if (!event.repeat) void openPreview(activeItem);
        return;
      }
      const action = getFileContextShortcutAction(event);
      if (!action) return;
      if (action === "open" && activeItem) { event.preventDefault(); if (!event.repeat) openItem(activeItem); }
      else if (action === "showInFolder" && activeItem) { event.preventDefault(); if (!event.repeat) showInFolder(activeItem); }
      else if (action === "copyPaths" && selectedItems.length > 0) { event.preventDefault(); if (!event.repeat) copyPaths(selectedItems); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeId, contextMenu, copyPaths, foreground, items, openItem, openPreview, selectedItems, showInFolder]);

  return {
    selectedIds, activeId, selectedItems, contextMenu, feedback,
    setContextMenu, selectItem, openItem, openPreview, openContextMenu,
    handleContextMenuAction, startDrag,
    finishDrag: () => onNativeDragStateChange(false),
    clearSelection: () => { setSelectedIds(new Set()); setActiveId(null); setContextMenu(null); }
  };
};
