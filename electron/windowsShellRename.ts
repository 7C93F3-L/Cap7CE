import { app } from "electron";
import { requestWindowsFileOperation } from "./core/coreWindowsFileOperations";
export interface ShellRenameOutcome { status: "renamed" | "cancelled" | "failed"; path?: string; error?: number }
export async function renameDirectoryWithWindowsShell(source: string, name: string, owner: string): Promise<ShellRenameOutcome> {
  if (process.platform !== "win32") throw new Error("folder-rename-windows-only");
  return await requestWindowsFileOperation({ packaged: app.isPackaged }, { operation: "rename", path: source, name, owner }) as ShellRenameOutcome;
}
