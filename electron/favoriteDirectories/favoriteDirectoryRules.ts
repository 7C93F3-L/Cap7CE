import path from "node:path";
import type { FavoriteDirectory } from "../../src/shared/favoriteDirectoryTypes";

export const maximumFavorites = 256;
export const maximumFavoriteBytes = 1024 * 1024;
export const favoriteId = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
export function favoritePath(value: unknown): string {
  if (typeof value !== "string" || value.length > 32767 || !/^[A-Za-z]:[\\/]/.test(value)
    || /[\x00-\x1f<>:"|?*]/.test(value.slice(2))) throw new Error("favorite-directory-invalid-path");
  const selected = path.win32.normalize(value);
  return selected[0].toUpperCase() + (selected.length > 3 ? selected.slice(1).replace(/\\+$/, "") : selected.slice(1));
}
export function favoriteName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256 || /[\x00-\x1f]/.test(value)) throw new Error("favorite-directory-invalid-name");
  return value.trim();
}
export const defaultFavoriteName = (directory: string) => path.win32.basename(directory) || directory.slice(0, 2);
export function readFavoriteDirectories(value: unknown): FavoriteDirectory[] {
  const record = value as { version?: unknown; directories?: unknown } | null;
  if (!record || Array.isArray(record) || Object.keys(record).length !== 2 || record.version !== 1
    || !Array.isArray(record.directories) || record.directories.length > maximumFavorites) throw new Error("favorite-directories-invalid-state");
  const ids = new Set<string>(), paths = new Set<string>();
  return record.directories.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).length !== 3 || !favoriteId(item.id)) throw new Error("favorite-directories-invalid-state");
    const directory = favoritePath(item.path), name = favoriteName(item.name);
    if (directory !== item.path || name !== item.name || ids.has(item.id.toLowerCase()) || paths.has(directory.toLowerCase())) throw new Error("favorite-directories-invalid-state");
    ids.add(item.id.toLowerCase()); paths.add(directory.toLowerCase()); return { id: item.id, name, path: directory };
  });
}
