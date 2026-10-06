import { BrowserWindow, dialog, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import type { FavoriteDirectoryRegistry } from "../../src/shared/favoriteDirectoryTypes";
import { registerIpcDomain, type IpcRegistrar } from "../ipcRegistration";
import { favoriteId, favoriteName, favoritePath } from "./favoriteDirectoryRules";

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
  choose: (event: IpcMainInvokeEvent) => Promise<string | null> = chooseDirectory): void {
  registerIpcDomain({ registrar, isSenderAllowed, registrations: [
    { kind: "handle", channel: "favoriteDirectories:list", listener: () => registry.list() },
    { kind: "handle", channel: "favoriteDirectories:choose", listener: async event => {
      const selected = await choose(event); return selected === null ? registry.list() : registry.add(favoritePath(selected));
    } },
    { kind: "handle", channel: "favoriteDirectories:add", listener: (_event, directory, name) =>
      registry.add(favoritePath(directory), name === undefined ? undefined : favoriteName(name)) },
    { kind: "handle", channel: "favoriteDirectories:rename", listener: (_event, id, name) => registry.rename(readId(id), favoriteName(name)) },
    { kind: "handle", channel: "favoriteDirectories:remove", listener: (_event, id) => registry.remove(readId(id)) },
    { kind: "handle", channel: "favoriteDirectories:move", listener: (_event, id, direction) => {
      if (direction !== "up" && direction !== "down") throw new Error("favorite-directory-invalid-direction");
      return registry.move(readId(id), direction);
    } }
  ] });
}
