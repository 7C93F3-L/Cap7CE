import path from "node:path";
import { favoritePath } from "./favoriteDirectoryRules";

export function folderRenameName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 255
    || /[\x00-\x1f<>:"/\\|?*]/.test(value) || /[ .]$/.test(value) || value === "." || value === ".."
    || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(value)) throw new Error("folder-rename-invalid-name");
  return value;
}
export function folderRenameTarget(source: string, name: unknown): string {
  const original = favoritePath(source);
  if (original.length <= 3) throw new Error("folder-rename-root");
  return favoritePath(path.win32.join(path.win32.dirname(original), folderRenameName(name)));
}
