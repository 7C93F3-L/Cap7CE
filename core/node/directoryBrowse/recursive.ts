import path from "node:path";
import fs from "node:fs/promises";
import { readSkimLocation, type SkimBrowseEntry } from "../../../electron/skimBrowseService";
import type { DirectoryBrowseOptions } from "../../../src/shared/directoryBrowseTypes";
import { filterDirectoryEntries, sortDirectoryEntries } from "./policy";

// A bounded, fresh directory-tree snapshot: sort once before exposing any page.
export class RecursiveDirectoryListing {
  private directories: string[];
  private pendingBytes = 0;
  private entries: SkimBrowseEntry[] = [];
  private offset = 0;
  private work?: Promise<void>;
  private ready = false;
  constructor(private readonly root: string, private readonly options: DirectoryBrowseOptions, private readonly cancelled: () => boolean) {
    this.directories = [root]; this.pendingBytes = root.length * 2;
  }
  get hasMore() { return !this.ready || this.offset < this.entries.length; }
  async read(): Promise<SkimBrowseEntry[]> {
    await (this.work ??= this.collect());
    this.checkCancelled();
    const result = this.entries.slice(this.offset, this.offset + 100); this.offset += result.length;
    return result;
  }
  private async collect() {
    let examined = 0, projectedBytes = 0;
    while (this.directories.length) {
      this.checkCancelled();
      const batch = this.directories.splice(-4);
      const settled = await Promise.allSettled(batch.map(async directory => {
      this.pendingBytes -= directory.length * 2;
      try {
        const stats = await fs.lstat(directory);
        const real = await fs.realpath(directory);
        const same = process.platform === "win32" ? real.toLowerCase() === path.resolve(directory).toLowerCase() : real === path.resolve(directory);
        if (!stats.isDirectory() || stats.isSymbolicLink() || !same) {
          if (directory === this.root) throw Error("directory-browse-invalid-root");
          return;
        }
        const value = await readSkimLocation(directory, this.cancelled, [], 65536, 32 * 1024 * 1024);
        this.checkCancelled();
        examined += value.entries.length;
        if (examined > 65536) throw Error("directory-browse-capacity-exceeded");
        const children = value.entries.filter(item => item.status === "ready" && (!this.options.excludeHidden || !item.hidden));
        const folders = sortDirectoryEntries(children.filter(item => item.kind === "folder"), this.options.sort);
        for (const folder of folders.reverse()) {
          const relative = path.relative(this.root, folder.path);
          if (!relative || path.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path.sep)) throw Error("directory-browse-invalid-descendant");
          this.pendingBytes += folder.path.length * 2;
          if (this.pendingBytes > 16 * 1024 * 1024) throw Error("directory-browse-capacity-exceeded");
          this.directories.push(folder.path);
        }
        for (const item of filterDirectoryEntries(children.filter(item => item.kind === "file"), this.options)) {
          projectedBytes += 2 * (item.name.length + item.path.length) + 512;
          if (projectedBytes > 32 * 1024 * 1024) throw Error("directory-browse-capacity-exceeded");
          this.entries.push(item);
        }
      } catch (error) {
        if (directory === this.root || !["EACCES", "EPERM", "ENOENT", "ENOTDIR", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      }
      }));
      for (const result of settled) if (result.status === "rejected") throw result.reason;
    }
    this.checkCancelled(); sortDirectoryEntries(this.entries, this.options.sort); this.ready = true;
  }
  private checkCancelled() { if (this.cancelled()) throw Error("directory-browse-cancelled"); }
}
