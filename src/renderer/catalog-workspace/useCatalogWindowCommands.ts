import { useCallback, useEffect, useRef } from "react";
import type { CatalogContextActions } from "../../shared/catalogWorkspaceTypes";
import type { UserPreferences } from "../../shared/types";
import { useCurrentPageRefreshShortcut } from "../controllers/useCurrentPageRefreshShortcut";
import { getShortcutFromKeyboardEvent, normalizeStableShortcutActions } from "../shortcutActions";
import { isEditableKeyboardTarget } from "../keyboardTarget";

const noop = () => {};
export function useCatalogWindowCommands(preferences: UserPreferences | null) {
  const actions = useRef<CatalogContextActions | null>(null);
  const nativeDragging = useRef(false);
  const reportActions = useCallback((value: CatalogContextActions | null) => { actions.current = value; }, []);
  const reportDrag = useCallback((active: boolean) => { nativeDragging.current = active; }, []);
  const refresh = useCallback(async () => !nativeDragging.current && await actions.current?.refresh() === true, []);
  useCurrentPageRefreshShortcut({ refresh, onRefreshed: noop, onFailed: noop });
  useEffect(() => {
    let focusTimer: number | null = null;
    const focusSearch = () => {
      if (focusTimer !== null) window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => { focusTimer = null; actions.current?.focusSearch(); }, 80);
    };
    const toggleBrowser = () => { if (!nativeDragging.current) actions.current?.toggleBrowser(); };
    const api = window.cap7ce?.window;
    const unsubscribers = [api?.onFocusMainSearch(focusSearch),
      api?.onToggleSkimLocationPickerRequested(toggleBrowser), api?.onActivateShellModeShortcut(mode => {
        if (mode === "standby") { if (!nativeDragging.current) void api.setShellState("standby"); }
        else focusSearch();
      })];
    return () => { unsubscribers.forEach(unsubscribe => unsubscribe?.()); if (focusTimer !== null) window.clearTimeout(focusTimer); };
  }, []);
  useEffect(() => {
    const shortcut = normalizeStableShortcutActions(preferences?.stableShortcutActions).cycleDirectory.replace(/\s+/g, "").toUpperCase();
    const keydown = (event: KeyboardEvent) => {
      const editable = isEditableKeyboardTarget(event.target);
      if (event.isComposing || !shortcut || (editable && !/\b(CTRL|ALT|SHIFT|META)\b/.test(shortcut))
        || !preferences?.quickActionGlobalEnabled || nativeDragging.current || event.defaultPrevented
        || getShortcutFromKeyboardEvent(event)?.toUpperCase() !== shortcut) return;
      event.preventDefault(); event.stopPropagation(); if (!event.repeat) actions.current?.cycleFavorite?.();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [preferences?.quickActionGlobalEnabled, preferences?.stableShortcutActions]);
  return { reportActions, reportDrag };
}
