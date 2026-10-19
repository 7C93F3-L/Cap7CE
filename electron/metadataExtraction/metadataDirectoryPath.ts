import path from "node:path";
// Pure IPC validation; Core owns task state and durable grants.
export const directoryBuildPath = (value: unknown): string => {
  if (typeof value !== "string" || value.length > 32768 || !/^[A-Za-z]:[\\/]/.test(value)
    || /[\x00-\x1f<>"|?*]/.test(value) || value.slice(2).includes(":")) throw new Error("metadata-directory-invalid-path");
  const normalized = path.win32.normalize(value);
  return normalized.length === 3 ? normalized : normalized.replace(/[\\/]+$/, "");
};
