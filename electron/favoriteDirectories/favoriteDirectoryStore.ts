import type { FavoriteDirectory, FavoriteDirectoryRegistry } from "../../src/shared/favoriteDirectoryTypes";
import type { DirectoryRename } from "../../src/shared/directoryRenameTypes";
import { readFavoriteDirectories } from "./favoriteDirectoryRules";
import { requestCoreConfiguration, type CoreConfigurationOptions } from "../core/coreConfigurationClient";

// Compatibility adapter: Core alone owns the same version-1 configuration file.
export class FavoriteDirectoryStore implements FavoriteDirectoryRegistry {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly filePath: string, private readonly options: CoreConfigurationOptions = {}) {}
  get renameJournalPath() { return `${this.filePath}.rename-pending`; }
  async waitForIdle(): Promise<void> { await this.tail; }
  private request(operation: string, body: Record<string, string> = {}): Promise<FavoriteDirectory[]> {
    const pending = this.tail.then(async () => readFavoriteDirectories({ version: 1,
      directories: await requestCoreConfiguration(this.filePath, { operation, ...body }, this.options) }));
    this.tail = pending.catch(() => undefined); return pending;
  }
  list() { return this.request("list"); }
  add(path: string, name?: string) { return this.request("add", { path, ...(name === undefined ? {} : { name }) }); }
  rename(id: string, name: string) { return this.request("rename", { id, name }); }
  remove(id: string) { return this.request("remove", { id }); }
  move(id: string, direction: "up" | "down") { return this.request("move", { id, direction }); }
  relocate(change: DirectoryRename) { return this.request("relocate", { ...change }); }
}
