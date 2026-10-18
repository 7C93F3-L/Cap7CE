import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../../electron/localization";
import type { CatalogHomeEntry } from "../../shared/catalogHomeTypes";
import type { CatalogWorkspaceAppearance } from "../../shared/catalogWorkspaceTypes";
import { getFileContextShortcutAction } from "../fileContextActions";
import { isEditableKeyboardTarget, isWorkspaceControlKeyboardTarget } from "../keyboardTarget";
import { useCatalogHomePreview } from "./useCatalogHomePreview";

export function useCatalogHomeActions({ entries, active, foreground, appearance, onOpen, menuOpen, closeMenu }: {
  entries: CatalogHomeEntry[]; active: boolean; foreground: boolean; appearance: Partial<CatalogWorkspaceAppearance>;
  onOpen: (path: string) => void; menuOpen: boolean; closeMenu: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()), [activeId, setActiveId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState(""), anchor = useRef<string | null>(null);
  const notify = useCallback((message: string) => setFeedback(message), []);
  useEffect(() => { if (feedback) { const timer = window.setTimeout(() => setFeedback(""), 5000); return () => window.clearTimeout(timer); } }, [feedback]);
  const selected = useMemo(() => entries.filter(entry => selectedIds.has(entry.path)), [entries, selectedIds]);
  const select = useCallback((entry: CatalogHomeEntry, additive = false, range = false) => {
    const start = entries.findIndex(item => item.path === anchor.current), end = entries.indexOf(entry);
    if (range && start >= 0 && end >= 0) {
      const paths = entries.slice(Math.min(start, end), Math.max(start, end) + 1).map(item => item.path);
      setSelectedIds(previous => new Set(additive ? [...previous, ...paths] : paths));
    } else {
      setSelectedIds(previous => { const next = new Set(additive ? previous : []); if (additive && next.has(entry.path)) next.delete(entry.path); else next.add(entry.path); return next; });
      anchor.current = entry.path;
    }
    setActiveId(entry.path);
  }, [entries]);
  const selectContext = (entry: CatalogHomeEntry) => { if (!selectedIds.has(entry.path)) select(entry); else setActiveId(entry.path); anchor.current = entry.path; };
  const clear = useCallback(() => { setSelectedIds(new Set()); setActiveId(null); anchor.current = null; closeMenu(); }, [closeMenu]);
  const preview = useCatalogHomePreview(entries, active, appearance, select, notify);
  const reveal = useCallback(async (entry: CatalogHomeEntry) => {
    try {
      const files = window.cap7ce?.files; if (!files) throw Error("unavailable");
      if (entry.kind === "drive") { if (await files.open(entry.path)) throw Error("unavailable"); }
      else await files.showInFolder(entry.path);
    } catch { notify(t("catalogHome.actionFailed")); }
  }, [notify]);
  const copy = useCallback(async (targets: CatalogHomeEntry[]) => {
    try { if (!await window.cap7ce?.files.copyPaths(targets.map(entry => entry.path))) throw Error("unavailable"); notify(t("clipboard.copied")); }
    catch { notify(t("catalogHome.actionFailed")); }
  }, [notify]);
  const drag = (entry: CatalogHomeEntry) => {
    const targets = selectedIds.has(entry.path) ? selected : [entry];
    if (targets.some(item => item.kind === "drive")) return;
    try { const start = window.cap7ce?.files.startDrag; if (!start) throw Error("unavailable"); appearance.onNativeDragStateChange?.(true); start(targets.map(item => item.path)); }
    catch { appearance.onNativeDragStateChange?.(false); notify(t("catalogHome.actionFailed")); }
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!foreground || !active || event.defaultPrevented || event.isComposing || isEditableKeyboardTarget(event.target) || isWorkspaceControlKeyboardTarget(event.target)) return;
      if (menuOpen) return;
      const entry = entries.find(item => item.path === activeId) ?? selected[0]; if (!entry) return;
      if (event.code === "Space" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) { event.preventDefault(); if (!event.repeat) void preview(entry); return; }
      const action = getFileContextShortcutAction(event);
      if (action === "open" || action === "showInFolder" || action === "copyPaths") {
        event.preventDefault(); if (event.repeat) return;
        if (action === "open") onOpen(entry.path); else if (action === "showInFolder") void reveal(entry); else if (selected.length) void copy(selected);
      }
    };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  }, [active, activeId, copy, entries, foreground, menuOpen, onOpen, preview, reveal, selected]);
  return { selectedIds, selected, activeId, select, selectContext, clear, preview, reveal, copy, drag, feedback };
}
