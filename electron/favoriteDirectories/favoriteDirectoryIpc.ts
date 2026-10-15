import { BrowserWindow, dialog, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import type { FavoriteDirectoryRegistry } from "../../src/shared/favoriteDirectoryTypes";
import { registerIpcDomain, type IpcRegistrar } from "../ipcRegistration";
import { favoriteId, favoriteName, favoritePath } from "./favoriteDirectoryRules";
import { folderRenameName } from "./favoriteFolderRenameRules";
import type { FavoriteFolderRenameService } from "./favoriteFolderRenameService";

const chooseDirectory = async (event: IpcMainInvokeEvent): Promise<string | null> => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  const options = { properties: ["openDirectory"] as ("openDirectory")[] };
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0] ?? null;
};
const readId = (id: unknown): string => {
  if (!favoriteId(id)) throw new Error("favorite-directory-invalid-id"); return id;
};
// User shortcuts do not authorize an index/build. The native picker is opened
// only by the allowed view's explicit choose action, never by startup/listing.
export function registerFavoriteDirectoryIpc(registrar: IpcRegistrar,
  isSenderAllowed: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean, registry: FavoriteDirectoryRegistry,
  choose: (event: IpcMainInvokeEvent) => Promise<string | null> = chooseDirectory,
  renameService?: Pick<FavoriteFolderRenameService, "recover" | "rename">): void {
  let renaming = false, tail: Promise<unknown> = Promise.resolve();
  const service = async () => renameService ??= new (await import("./favoriteFolderRenameService")).FavoriteFolderRenameService(registry);
  const guarded = <T>(action: () => Promise<T>, rename = false): Promise<T> => {
    if (renaming) return Promise.reject(new Error("folder-rename-busy"));
    if (rename) renaming = true;
    const operation = tail.then(async () => { await (await service()).recover(); return action(); });
    tail = operation.catch(() => undefined);
    return operation.finally(() => { if (rename) renaming = false; });
  };
  registerIpcDomain({ registrar, isSenderAllowed, registrations: [
    { kind: "handle", channel: "favoriteDirectories:list", listener: () => guarded(() => registry.list()) },
    { kind: "handle", channel: "favoriteDirectories:renameFolder", listener: (event, id, name) => {
      const selected = readId(id), label = folderRenameName(name);
      return guarded(async () => {
        const parent = BrowserWindow.fromWebContents(event.sender);
        if (!parent || parent.isDestroyed()) throw new Error("folder-rename-window-unavailable");
        const handle = parent.getNativeWindowHandle(), owner = handle.length === 8 ? handle.readBigUInt64LE().toString() : String(handle.readUInt32LE());
        return (await service()).rename(selected, label, owner);
      }, true);
    } },
    { kind: "handle", channel: "favoriteDirectories:choose", listener: event => guarded(async () => {
      const selected = await choose(event); return selected === null ? registry.list() : registry.add(favoritePath(selected));
    }) },
    { kind: "handle", channel: "favoriteDirectories:add", listener: (_event, directory, name) =>
      guarded(() => registry.add(favoritePath(directory), name === undefined ? undefined : favoriteName(name))) },
    { kind: "handle", channel: "favoriteDirectories:rename", listener: (_event, id, name) => guarded(() => registry.rename(readId(id), favoriteName(name))) },
    { kind: "handle", channel: "favoriteDirectories:remove", listener: (_event, id) => guarded(() => registry.remove(readId(id))) },
    { kind: "handle", channel: "favoriteDirectories:move", listener: (_event, id, direction) => {
      if (direction !== "up" && direction !== "down") throw new Error("favorite-directory-invalid-direction");
      return guarded(() => registry.move(readId(id), direction));
    } }
  ] });
}
