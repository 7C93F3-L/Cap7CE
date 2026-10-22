import path from "node:path";
import fs from "node:fs/promises";
import { readSkimLocation, type SkimBrowseEntry } from "../../../electron/skimBrowseService";
import type { DirectoryBrowseOptions } from "../../../src/shared/directoryBrowseTypes";
import { filterDirectoryEntries, sortDirectoryEntries } from "./policy";

// Demand-driven pages: never collect an entire volume before returning results.
export class RecursiveDirectoryListing {
  private directories: string[];
  private pendingBytes = 0;
  private entries: SkimBrowseEntry[] = [];
  private offset = 0;
  constructor(private readonly root: string, private readonly options: DirectoryBrowseOptions, private readonly cancelled: () => boolean) {
    this.directories = [root]; this.pendingBytes = root.length * 2;
  }
  get hasMore() { return this.offset < this.entries.length || this.directories.length > 0; }
  async read(): Promise<SkimBrowseEntry[]> {
    const result: SkimBrowseEntry[] = [];
    while (result.length < 100 && this.hasMore) {
      this.checkCancelled();
      while (result.length < 100 && this.offset < this.entries.length) result.push(this.entries[this.offset++]);
      if (result.length === 100 || !this.directories.length) break;
      const directory = this.directories.pop()!; this.pendingBytes -= directory.length * 2;
      try {
        const stats = await fs.lstat(directory);
        const real = await fs.realpath(directory);
        const same = process.platform === "win32" ? real.toLowerCase() === path.resolve(directory).toLowerCase() : real === path.resolve(directory);
        if (!stats.isDirectory() || stats.isSymbolicLink() || !same) {
          if (directory === this.root) throw Error("directory-browse-invalid-root");
          continue;
        }
        const value = await readSkimLocation(directory, this.cancelled, [], 65536, 32 * 1024 * 1024);
        this.checkCancelled();
        const children = value.entries.filter(item => item.status === "ready" && (!this.options.excludeHidden || !item.hidden));
        const folders = sortDirectoryEntries(children.filter(item => item.kind === "folder"), this.options.sort);
        for (const folder of folders.reverse()) {
          const relative = path.relative(this.root, folder.path);
          if (!relative || path.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path.sep)) throw Error("directory-browse-invalid-descendant");
          this.pendingBytes += folder.path.length * 2;
          if (this.pendingBytes > 16 * 1024 * 1024) throw Error("directory-browse-capacity-exceeded");
          this.directories.push(folder.path);
        }
        this.entries = sortDirectoryEntries(filterDirectoryEntries(children.filter(item => item.kind === "file"), this.options), this.options.sort);
        this.offset = 0;
      } catch (error) {
        if (directory === this.root || !["EACCES", "EPERM", "ENOENT", "ENOTDIR", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
        this.entries = []; this.offset = 0;
      }
    }
    this.checkCancelled(); return result;
  }
  private checkCancelled() { if (this.cancelled()) throw Error("directory-browse-cancelled"); }
}
