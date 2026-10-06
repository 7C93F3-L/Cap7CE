import type { IpcRenderer } from "electron";
import type { FavoriteDirectoryApi } from "../../src/shared/favoriteDirectoryTypes";

export const createFavoriteDirectoryBridge = (ipc: Pick<IpcRenderer, "invoke">): FavoriteDirectoryApi => ({
  list: () => ipc.invoke("favoriteDirectories:list"),
  choose: () => ipc.invoke("favoriteDirectories:choose"),
  add: (path, name) => ipc.invoke("favoriteDirectories:add", path, name),
  rename: (id, name) => ipc.invoke("favoriteDirectories:rename", id, name),
  remove: id => ipc.invoke("favoriteDirectories:remove", id),
  move: (id, direction) => ipc.invoke("favoriteDirectories:move", id, direction)
});
