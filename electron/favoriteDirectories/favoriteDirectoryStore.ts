import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { FavoriteDirectory, FavoriteDirectoryRegistry } from "../../src/shared/favoriteDirectoryTypes";
import { defaultFavoriteName, favoriteId, favoriteName, favoritePath, maximumFavoriteBytes, maximumFavorites, readFavoriteDirectories } from "./favoriteDirectoryRules";

// Persists one application configuration file. It has no asset reads, indexing
// controller or cache/database ownership; removing a shortcut only changes JSON.
export class FavoriteDirectoryStore implements FavoriteDirectoryRegistry {
  private cached?: FavoriteDirectory[];
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly filePath: string) {}
  async waitForIdle(): Promise<void> { await this.tail; }
  list(): Promise<FavoriteDirectory[]> { return this.schedule(async () => this.copy(await this.load())); }
  add(directoryPath: string, name?: string): Promise<FavoriteDirectory[]> {
    return this.schedule(async () => {
      const selected = favoritePath(directoryPath), label = favoriteName(name === undefined ? defaultFavoriteName(selected) : name);
      const current = await this.load();
      if (current.some(item => item.path.toLowerCase() === selected.toLowerCase())) return this.copy(current);
      if (current.length >= maximumFavorites) throw new Error("favorite-directories-limit");
      return this.save([...current, { id: randomUUID(), path: selected, name: label }]);
    });
  }
  rename(id: string, name: string): Promise<FavoriteDirectory[]> {
    return this.schedule(async () => {
      const label = favoriteName(name), current = await this.load(); this.requireId(current, id);
      if (current.find(item => item.id === id)!.name === label) return this.copy(current);
      return this.save(current.map(item => item.id === id ? { ...item, name: label } : item));
    });
  }
  remove(id: string): Promise<FavoriteDirectory[]> {
    return this.schedule(async () => {
      const current = await this.load(); this.requireId(current, id);
      return this.save(current.filter(item => item.id !== id));
    });
  }
  move(id: string, direction: "up" | "down"): Promise<FavoriteDirectory[]> {
    return this.schedule(async () => {
      if (direction !== "up" && direction !== "down") throw new Error("favorite-directory-invalid-direction");
      const current = await this.load(); const index = this.requireId(current, id);
      const target = index + (direction === "up" ? -1 : 1);
      if (target < 0 || target >= current.length) return this.copy(current);
      const next = this.copy(current); [next[index], next[target]] = [next[target], next[index]];
      return this.save(next);
    });
  }
  private schedule<T>(action: () => Promise<T>): Promise<T> {
    const pending = this.tail.then(action); this.tail = pending.catch(() => undefined); return pending;
  }
  private copy(items: FavoriteDirectory[]) { return items.map(item => ({ ...item })); }
  private requireId(items: FavoriteDirectory[], id: string): number {
    const index = favoriteId(id) ? items.findIndex(item => item.id === id) : -1;
    if (index < 0) throw new Error("favorite-directory-not-found"); return index;
  }
  private async load(): Promise<FavoriteDirectory[]> {
    if (this.cached) return this.cached;
    try {
      const file = await fs.open(this.filePath, "r");
      try {
        const buffer = Buffer.alloc(maximumFavoriteBytes + 1);
        let length = 0;
        while (length < buffer.length) {
          const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
          if (!bytesRead) break; length += bytesRead;
        }
        if (length > maximumFavoriteBytes) throw new Error("favorite-directories-state-too-large");
        this.cached = readFavoriteDirectories(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length))));
      } finally { await file.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.cached = [];
    }
    return this.cached;
  }
  private async save(items: FavoriteDirectory[]): Promise<FavoriteDirectory[]> {
    const contents = JSON.stringify({ version: 1, directories: items });
    if (Buffer.byteLength(contents) > maximumFavoriteBytes) throw new Error("favorite-directories-state-too-large");
    const temporary = `${this.filePath}.${randomUUID()}.pending`;
    let created = false;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const output = await fs.open(temporary, "wx"); created = true;
      try { await output.writeFile(contents); } finally { await output.close(); }
      await fs.rename(temporary, this.filePath);
      this.cached = this.copy(items); return this.copy(items);
    } finally { if (created) await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
  }
}
