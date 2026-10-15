import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FavoriteDirectoryRegistry } from "../../src/shared/favoriteDirectoryTypes";
import type { DirectoryRename, FavoriteFolderRenameResult } from "../../src/shared/directoryRenameTypes";
import { favoritePath } from "./favoriteDirectoryRules";
import { folderRenameTarget } from "./favoriteFolderRenameRules";
import { renamedDirectoryPath } from "../directoryRenamePaths";
import { renameDirectoryWithWindowsShell } from "../windowsShellRename";

interface RenameRecord extends DirectoryRename { dev: string; ino: string }
export class FavoriteFolderRenameService {
  constructor(private readonly registry: FavoriteDirectoryRegistry,
    private readonly shell = renameDirectoryWithWindowsShell,
    private readonly preferences = async (change: DirectoryRename) => (await import("../catalogGridPreferenceRegistry")).relocateCatalogGridPreferences(change),
    private readonly prepare = async (source: string) => {
      if ((await import("../visualCacheService")).isCap7CECachePath(source)) throw new Error("folder-rename-protected");
      (await import("../visualRenderService")).releaseVisualRenderFileHandles();
    }) {}
  private get journal() {
    if (!this.registry.renameJournalPath) throw new Error("folder-rename-unavailable");
    return this.registry.renameJournalPath;
  }
  private async committed(record: RenameRecord) {
    const stat = await fs.lstat(record.newPath, { bigint: true }).catch(() => null);
    if (!stat?.isDirectory() || stat.isSymbolicLink() || String(stat.dev) !== record.dev || String(stat.ino) !== record.ino) return false;
    if (record.oldPath.toLowerCase() === record.newPath.toLowerCase()) {
      const entries = await fs.opendir(path.dirname(record.newPath));
      for await (const entry of entries) if (entry.name === path.basename(record.newPath)) return true;
      return false;
    }
    return true;
  }
  private async apply(record: RenameRecord) {
    await this.preferences(record);
    const directories = await this.registry.relocate(record);
    await fs.unlink(this.journal); return directories;
  }
  async recover(): Promise<void> {
    if (!this.registry.renameJournalPath) return;
    const file = await fs.open(this.journal, "r").catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (!file) return;
    let record: RenameRecord;
    try {
      if ((await file.stat()).size > 256 * 1024) throw new Error("folder-rename-invalid-recovery");
      record = JSON.parse(await file.readFile("utf8")) as RenameRecord;
      if (favoritePath(record.oldPath) !== record.oldPath || folderRenameTarget(record.oldPath, path.basename(record.newPath)) !== record.newPath
        || !/^\d+$/.test(record.dev) || !/^\d+$/.test(record.ino)) throw new Error("folder-rename-invalid-recovery");
    } finally { await file.close(); }
    if (await this.committed(record)) { await this.apply(record); return; }
    const old = await fs.lstat(record.oldPath, { bigint: true }).catch(() => null);
    if (String(old?.dev) === record.dev && String(old?.ino) === record.ino) { await fs.unlink(this.journal); return; }
    throw new Error("folder-rename-recovery-needed");
  }
  async rename(id: string, name: string, owner: string): Promise<FavoriteFolderRenameResult> {
    const directories = await this.registry.list(), item = directories.find(value => value.id === id);
    if (!item) throw new Error("favorite-directory-not-found");
    const newPath = folderRenameTarget(item.path, name), oldPath = item.path;
    if (newPath === oldPath) return { change: null, directories };
    const movedPaths = directories.map(value => renamedDirectoryPath(value.path, { oldPath, newPath })!.toLowerCase());
    if (new Set(movedPaths).size !== directories.length) throw new Error("folder-rename-favorite-conflict");
    const source = await fs.lstat(oldPath, { bigint: true });
    if (!source.isDirectory() || source.isSymbolicLink()) throw new Error("folder-rename-not-directory");
    // Do not authorize through an ancestor junction or mutate the configuration's own ancestor.
    if ((await fs.realpath(oldPath)).toLowerCase() !== oldPath.toLowerCase()
      || renamedDirectoryPath(this.journal, { oldPath, newPath }) !== this.journal) throw new Error("folder-rename-protected");
    await this.prepare(oldPath);
    const record: RenameRecord = { oldPath, newPath, dev: String(source.dev), ino: String(source.ino) };
    await fs.mkdir(path.dirname(this.journal), { recursive: true });
    const staging = `${this.journal}.${randomUUID()}.preparing`;
    try {
      const journal = await fs.open(staging, "wx");
      try { await journal.writeFile(JSON.stringify(record)); await journal.sync(); } finally { await journal.close(); }
      await fs.rename(staging, this.journal);
    } finally { await fs.unlink(staging).catch(error => { if (error.code !== "ENOENT") throw error; }); }
    let outcome;
    try { outcome = await this.shell(oldPath, name, owner); }
    catch (error) { if (!await this.committed(record)) { await this.recover(); throw error; } }
    if (outcome?.status === "renamed" && outcome.path !== newPath) {
      record.newPath = favoritePath(outcome.path);
      if (folderRenameTarget(oldPath, path.basename(record.newPath)) !== record.newPath) throw new Error("folder-rename-unexpected-target");
      await fs.writeFile(this.journal, JSON.stringify(record));
    }
    if (!await this.committed(record)) {
      if (outcome?.status === "renamed") throw new Error("folder-rename-target-changed");
      await this.recover();
      if (outcome?.status === "failed") throw new Error(`folder-rename-shell-failed:${outcome.error ?? 0}`);
      return { change: null, directories };
    }
    const change = { oldPath: record.oldPath, newPath: record.newPath };
    try { return { change, directories: await this.apply(record) }; }
    catch {
      // The disk already changed. Keep a durable record and report the real paths,
      // rather than claiming the rename failed or attempting an unsafe rollback.
      return { change, directories: directories.map(value => {
        const moved = renamedDirectoryPath(value.path, record)!;
        return moved === value.path ? value : { ...value, path: moved, name: path.basename(moved) };
      }), warning: "folder-rename-save-pending" };
    }
  }
}
