import type { ShortcutActionPreferences } from "../shared/types";

export const defaultShortcutActions: ShortcutActionPreferences = {
  activateCapsule: "Alt+`",
  activateMicro: "Alt+1",
  activateMini: "Alt+2",
  activateNormal: "Alt+3",
  activateStandby: "Alt+4",
  activateSkim: "Alt+5",
  cycleDirectory: "Alt+Q",
  openSettings: "Alt+6"
};

export const normalizeShortcutActions = (
  shortcutActions?: Partial<ShortcutActionPreferences>
): ShortcutActionPreferences => ({
  activateCapsule: shortcutActions?.activateCapsule || defaultShortcutActions.activateCapsule,
  activateMicro: shortcutActions?.activateMicro || defaultShortcutActions.activateMicro,
  activateMini: shortcutActions?.activateMini || defaultShortcutActions.activateMini,
  activateNormal: shortcutActions?.activateNormal || defaultShortcutActions.activateNormal,
  activateStandby: shortcutActions?.activateStandby || defaultShortcutActions.activateStandby,
  activateSkim: shortcutActions?.activateSkim || defaultShortcutActions.activateSkim,
  cycleDirectory: shortcutActions?.cycleDirectory || defaultShortcutActions.cycleDirectory,
  openSettings: shortcutActions?.openSettings || defaultShortcutActions.openSettings
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
