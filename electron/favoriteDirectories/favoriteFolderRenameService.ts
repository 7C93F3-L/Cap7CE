import { app } from "electron";
import { requestCoreFolderRename, type CoreFolderRenameState } from "../core/coreFolderRename";
import type { FavoriteDirectoryRegistry } from "../../src/shared/favoriteDirectoryTypes";
import type { DirectoryRename, FavoriteFolderRenameResult } from "../../src/shared/directoryRenameTypes";
import { renameDirectoryWithWindowsShell } from "../windowsShellRename";

export class FavoriteFolderRenameService {
  constructor(private readonly registry: FavoriteDirectoryRegistry,
    private readonly shell = renameDirectoryWithWindowsShell,
    private readonly preferences = async (change: DirectoryRename) => (await import("../catalogGridPreferenceRegistry")).relocateCatalogGridPreferences(change),
    private readonly prepare = async (source: string) => {
      if ((await import("../visualCacheService")).isCap7CECachePath(source)) throw new Error("folder-rename-protected");
      (await import("../visualRenderService")).releaseVisualRenderFileHandles();
    }) {}
  private request(action: "prepare" | "observe" | "recover" | "complete", body: Parameters<typeof requestCoreFolderRename>[3] = {}) {
    const journal = this.registry.renameJournalPath;
    if (!journal?.endsWith(".rename-pending")) throw new Error("folder-rename-unavailable");
    return requestCoreFolderRename({ packaged: app?.isPackaged ?? false }, journal.slice(0, -".rename-pending".length), action, body);
  }
  private async apply(state: CoreFolderRenameState) {
    await this.preferences(state.change!);
    return (await this.request("complete", { ticket: state.ticket! })).directories;
  }
  async recover(): Promise<void> {
    if (!this.registry.renameJournalPath) return;
    const state = await this.request("recover"); if (state.kind === "moved") await this.apply(state);
  }
  async rename(id: string, name: string, owner: string): Promise<FavoriteFolderRenameResult> {
    const planned = await this.request("prepare", { id, name });
    if (planned.kind === "none") return { change: null, directories: planned.directories };
    try { await this.prepare(planned.change!.oldPath); }
    catch (error) { await this.recover(); throw error; }
    let outcome, failure;
    try { outcome = await this.shell(planned.change!.oldPath, name, owner); } catch (error) { failure = error; }
    const state = await this.request("observe", { outcome: outcome ?? null });
    if (state.kind !== "moved") { if (failure) throw failure; return { change: null, directories: planned.directories }; }
    try { return { change: state.change, directories: await this.apply(state) }; }
    catch { return { change: state.change, directories: state.directories, warning: "folder-rename-save-pending" }; }
  }
}
