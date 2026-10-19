import { coreNativeExecutable, requestCoreNative, type CoreNativeOptions } from "./coreNativeRequest";
import type { FavoriteDirectory } from "../../src/shared/favoriteDirectoryTypes";
import type { DirectoryRename } from "../../src/shared/directoryRenameTypes";
import { readFavoriteDirectories, favoritePath } from "../favoriteDirectories/favoriteDirectoryRules";
import type { ShellRenameOutcome } from "../windowsShellRename";

export interface CoreFolderRenameState { kind: "none" | "prepared" | "moved"; ticket: string | null; change: DirectoryRename | null; directories: FavoriteDirectory[] }
export async function requestCoreFolderRename(options: CoreNativeOptions, configurationPath: string,
  action: "prepare" | "observe" | "recover" | "complete", body: { id?: string; name?: string; ticket?: string; outcome?: ShellRenameOutcome | null } = {}): Promise<CoreFolderRenameState> {
  const executable = coreNativeExecutable(options, "core-file-operations/v1", "file-operations-host", "Cap7CE.Core.FileOperations.Host.exe");
  const value = await requestCoreNative(executable, [], { operation: `folder-rename-${action}`, configurationPath, ...body }, "folder-rename", 2 * 1024 * 1024) as CoreFolderRenameState & { ok?: unknown; error?: unknown } | null;
  if (value?.ok !== true) throw new Error(typeof value?.error === "string" && /^(?:folder-rename|favorite-director(?:y|ies))-[a-z0-9:-]+$/.test(value.error)
    ? value.error : "folder-rename-host-invalid-response");
  if (!["none", "prepared", "moved"].includes(value.kind) || value.kind !== "none" && (!value.change || !value.ticket || !/^[0-9A-F]{64}$/.test(value.ticket)
    || favoritePath(value.change.oldPath) !== value.change.oldPath || favoritePath(value.change.newPath) !== value.change.newPath)) throw new Error("folder-rename-host-invalid-response");
  return { kind: value.kind, ticket: value.ticket, change: value.change, directories: readFavoriteDirectories({ version: 1, directories: value.directories }) };
}
