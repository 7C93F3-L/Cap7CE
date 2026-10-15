import type { DirectoryRename } from "../src/shared/directoryRenameTypes";

const trim = (value: string) => value.replace(/\//g, "\\").replace(/\\+$/, "");
export function renamedDirectoryPath(value: string | null, change: DirectoryRename): string | null {
  if (value === null) return null;
  const source = trim(change.oldPath), candidate = trim(value);
  if (candidate.toLowerCase() === source.toLowerCase()) return change.newPath;
  return candidate.toLowerCase().startsWith(`${source.toLowerCase()}\\`)
    ? change.newPath + candidate.slice(source.length) : value;
}
export function renameDirectoryPreferenceKeys<T>(values: Record<string, T>, change: DirectoryRename): Record<string, T> {
  const next = { ...values };
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith("favorite:")) continue;
    const old = key.slice(9), moved = renamedDirectoryPath(old, change)!;
    if (moved === old) continue;
    delete next[key]; next[`favorite:${trim(moved).toLowerCase()}`] = value;
  }
  return next;
}
