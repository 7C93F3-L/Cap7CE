import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import type { NativeFileContextMenuAction, NativeFileContextMenuRequest } from "./nativeFileContextMenuTypes";

interface NativeFileContextMenuIpcOptions {
  registrar: IpcRegistrar;
  getWindow: () => BrowserWindow | null;
}

const actionAccelerators: Partial<Record<NativeFileContextMenuAction, string>> = {
  preview: "Space",
  open: "Enter",
  showInFolder: "CommandOrControl+Enter",
  copyPaths: "CommandOrControl+Shift+C",
  delete: "Delete",
  addDirectory: "CommandOrControl+Shift+D",
  addToSidebar: "CommandOrControl+Shift+B"
};

const allowedActions = new Set<NativeFileContextMenuAction>([
  "preview", "open", "showInFolder", "copyPaths", "editKeywords", "delete", "addDirectory", "addToSidebar"
]);

const isRequest = (value: unknown): value is NativeFileContextMenuRequest => {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<NativeFileContextMenuRequest>;
  if (typeof request.fileName !== "string" || typeof request.summary !== "string" || !Array.isArray(request.items)) return false;
  if (request.items.length === 0 || request.items.length > allowedActions.size) return false;
  const ids = new Set<NativeFileContextMenuAction>();
  return request.items.every((item) => {
    if (!item || typeof item !== "object" || !allowedActions.has(item.id) || ids.has(item.id) || typeof item.label !== "string") return false;
    if (item.disabled !== undefined && typeof item.disabled !== "boolean") return false;
    if (item.separatorBefore !== undefined && typeof item.separatorBefore !== "boolean") return false;
    ids.add(item.id);
    return true;
  });
};

const getDisplayWidth = (character: string) => character.codePointAt(0)! > 0xff ? 2 : 1;

export const ellipsizeNativeMenuLabel = (label: string, maximumWidth: number): string => {
  const characters = Array.from(label);
  if (characters.reduce((width, character) => width + getDisplayWidth(character), 0) <= maximumWidth) return label;
  const availableWidth = Math.max(2, maximumWidth - getDisplayWidth("…"));
  const leadingTarget = Math.ceil(availableWidth * 0.6);
  const trailingTarget = availableWidth - leadingTarget;
  let leading = "", leadingWidth = 0, trailing = "", trailingWidth = 0;
  for (const character of characters) {
    const width = getDisplayWidth(character);
    if (leadingWidth + width > leadingTarget) break;
    leading += character;
    leadingWidth += width;
  }
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const character = characters[index];
    const width = getDisplayWidth(character);
    if (trailingWidth + width > trailingTarget) break;
    trailing = character + trailing;
    trailingWidth += width;
  }
  return `${leading}…${trailing}`;
};

const sanitizeLabel = (label: string, maximumWidth: number) => ellipsizeNativeMenuLabel(
  label.replace(/[\r\n\t]+/g, " ").trim(),
  maximumWidth
).replace(/&/g, "&&");

export const buildNativeFileContextMenuTemplate = (
  request: NativeFileContextMenuRequest,
  select: (action: NativeFileContextMenuAction) => void
): MenuItemConstructorOptions[] => {
  const action = ({ id, label, disabled }: NativeFileContextMenuRequest["items"][number]): MenuItemConstructorOptions => ({
    label: sanitizeLabel(label, 60),
    accelerator: actionAccelerators[id],
    registerAccelerator: false,
    enabled: !disabled,
    click: () => select(id)
  });
  const actionItems = request.items.flatMap((item, index) => [
    ...(index > 0 && item.separatorBefore ? [{ type: "separator" as const }] : []),
    action(item)
  ]);
  return [
    { label: sanitizeLabel(request.fileName, 26), enabled: false },
    { label: sanitizeLabel(request.summary, 36), enabled: false },
    { type: "separator" },
    ...actionItems
  ];
};

export const registerNativeFileContextMenuIpc = ({ registrar, getWindow }: NativeFileContextMenuIpcOptions): void => {
  registerIpcDomain({
    registrar,
    isSenderAllowed: (event) => {
      const window = getWindow();
      return Boolean(window && !window.isDestroyed() && event.sender === window.webContents);
    },
    registrations: [{
      kind: "handle",
      channel: "fileContextMenu:open",
      listener: (_event, request: unknown) => new Promise<NativeFileContextMenuAction | null>((resolve) => {
        const window = getWindow();
        if (!window || window.isDestroyed() || !isRequest(request)) {
          resolve(null);
          return;
        }
        let settled = false;
        const settle = (action: NativeFileContextMenuAction | null) => {
          if (settled) return;
          settled = true;
          resolve(action);
        };
        const menu = Menu.buildFromTemplate(buildNativeFileContextMenuTemplate(request, settle));
        menu.popup({ window, callback: () => settle(null) });
      })
    }]
  });
};
