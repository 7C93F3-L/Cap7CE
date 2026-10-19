import { coreNativeExecutable, requestCoreNative, type CoreNativeOptions } from "./coreNativeRequest";
import path from "node:path";
export interface CoreWindowsFileResult { status: "renamed" | "cancelled" | "failed" | "deleted"; path?: string; error?: number }
export async function requestWindowsFileOperation(options: CoreNativeOptions,
  request: { operation: "rename" | "trash"; path: string; name?: string; owner?: string }): Promise<CoreWindowsFileResult> {
  const executable = coreNativeExecutable(options, "core-file-operations/v1", "file-operations-host", "Cap7CE.Core.FileOperations.Host.exe");
  const result = await requestCoreNative(executable, [], request, "file-operation", 1024 * 1024, 0) as CoreWindowsFileResult | null;
  if (!result || !["renamed", "cancelled", "failed", "deleted"].includes(result.status)
    || !Number.isInteger(result.error) || Number(result.error) < -2147483648 || Number(result.error) > 2147483647
    || request.operation === "rename" && result.status === "deleted" || request.operation === "trash" && result.status === "renamed"
    || result.status === "renamed" && (typeof result.path !== "string" || !path.isAbsolute(result.path) || result.path.includes("\0")))
    throw new Error("file-operation-host-invalid-response");
  return result;
}
