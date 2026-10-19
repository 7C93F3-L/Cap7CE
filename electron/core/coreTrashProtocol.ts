import path from "node:path";
export interface CoreTrashTarget { path: string; isDirectory: boolean }
export interface CoreTrashFailure { path: string; code: string; error: number }
export interface CoreTrashResult { success: boolean; totalCount: number; deletedPaths: string[]; failedItems: CoreTrashFailure[] }
export interface CoreTrashRequest { mode: "catalog" | "legacy"; targets: readonly CoreTrashTarget[]; cacheRoots: readonly string[] }
export const coreTrashMaximumBytes = 24 * 1024 * 1024;
const key = (value: string) => path.resolve(value).toLowerCase();
export const readCoreTrashResult = (value: unknown, id: number, request: CoreTrashRequest): CoreTrashResult => {
  const result = value as CoreTrashResult & { requestId: number };
  const total = request.mode === "catalog" ? new Set(request.targets.map(item => key(item.path))).size : request.targets.length;
  const paths = new Set(request.targets.map(item => item.path)), seen = new Set<string>();
  const accept = (value: unknown): value is string => {
    if (typeof value !== "string" || !paths.has(value) || seen.has(key(value))) return false;
    seen.add(key(value)); return true;
  };
  if (!result || typeof result !== "object" || result.requestId !== id || typeof result.success !== "boolean" || result.totalCount !== total
    || !Array.isArray(result.deletedPaths) || !Array.isArray(result.failedItems) || result.deletedPaths.length + result.failedItems.length !== total
    || !result.deletedPaths.every(accept) || !result.failedItems.every(item => item && accept(item.path)
      && ["protected-path", "target-changed", "not-file", "source-missing", "permission-denied", "source-unavailable", "aborted", "shell-failed"].includes(item.code)
      && Number.isInteger(item.error) && item.error >= -2147483648 && item.error <= 2147483647)
    || result.success !== (total > 0 && result.failedItems.length === 0)) throw new Error("core-trash-host-invalid-response");
  return { success: result.success, totalCount: total, deletedPaths: [...result.deletedPaths], failedItems: result.failedItems.map(item => ({ ...item })) };
};
export const coreTrashFailureError = (failure: CoreTrashFailure): Error => Object.assign(new Error(
  failure.code === "aborted" ? "Operation was aborted" : failure.code === "shell-failed" ? "Failed to perform delete operation" : `core-trash-${failure.code}`),
  { code: failure.code === "source-missing" ? "ENOENT" : failure.code === "permission-denied" ? "EPERM" : undefined });
