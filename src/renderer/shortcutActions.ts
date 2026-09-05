import type { ShortcutActionPreferences } from "../shared/types";

export const defaultStableShortcutActions: ShortcutActionPreferences = {
  focusMainSearch: "Alt+`",
  restoreDefaultWindow: "Alt+4",
  hideToLine: "Alt+1",
  toggleSkim: "Alt+2",
  cycleDirectory: "Alt+Q",
  openSettings: "Alt+3"
};

export const normalizeStableShortcutActions = (
  shortcutActions?: Partial<ShortcutActionPreferences>
): ShortcutActionPreferences => ({
  focusMainSearch: shortcutActions?.focusMainSearch || defaultStableShortcutActions.focusMainSearch,
  restoreDefaultWindow: shortcutActions?.restoreDefaultWindow || defaultStableShortcutActions.restoreDefaultWindow,
  hideToLine: shortcutActions?.hideToLine || defaultStableShortcutActions.hideToLine,
  toggleSkim: shortcutActions?.toggleSkim || defaultStableShortcutActions.toggleSkim,
  cycleDirectory: shortcutActions?.cycleDirectory || defaultStableShortcutActions.cycleDirectory,
  openSettings: shortcutActions?.openSettings || defaultStableShortcutActions.openSettings
});

export const formatShortcutLabel = (shortcut: string) => shortcut
  .split("+")
  .map((part) => part.trim())
  .filter(Boolean)
  .join(" + ");

export const getShortcutFromKeyboardEvent = (event: KeyboardEvent) => {
  const keyMap: Record<string, string> = {
    Escape: "Esc",
    " ": "Space",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right"
  };
  const ignoredKeys = new Set(["Alt", "Control", "Shift", "Meta"]);
  if (ignoredKeys.has(event.key)) return null;

  const key = keyMap[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  parts.push(key);
  return parts.join("+");
};
