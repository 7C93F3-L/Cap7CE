import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export interface MetadataDirectoryJob { path: string; scope?: { volumeId: string; rootFileReference: string | null } }
export interface MetadataDirectoryQueue { version: 1; intent: "active" | "paused"; jobs: MetadataDirectoryJob[] }
export interface MetadataDirectoryStore { load(): Promise<MetadataDirectoryQueue | null>; save(value: MetadataDirectoryQueue): Promise<void> }
export const directoryBuildPath = (value: unknown): string => {
  if (typeof value !== "string" || value.length > 32768 || !/^[A-Za-z]:[\\/]/.test(value)
    || /[\x00-\x1f<>"|?*]/.test(value) || value.slice(2).includes(":")) throw new Error("metadata-directory-invalid-path");
  const normalized = path.win32.normalize(value);
  return normalized.length === 3 ? normalized : normalized.replace(/[\\/]+$/, "");
};
const valid = (value: unknown): value is MetadataDirectoryQueue => {
  const queue = value as MetadataDirectoryQueue | null;
  if (queue?.version !== 1 || !["active", "paused"].includes(queue.intent) || !Array.isArray(queue.jobs) || queue.jobs.length > 32) return false;
  try { return queue.jobs.every(job => !!job && directoryBuildPath(job.path) === job.path && (!job.scope
    || /^[A-Fa-f0-9]{32}$/.test(job.scope.volumeId) && (job.scope.rootFileReference === null || /^[A-Fa-f0-9]{16}$/.test(job.scope.rootFileReference)))); }
  catch { return false; }
};
// Stores task grants only. Catalog and source files are never opened here.
export const createMetadataDirectoryStore = (file: string): MetadataDirectoryStore => {
  let writing = Promise.resolve();
  return {
    async load() {
      await writing;
      try {
        const handle = await open(file, "r"); let text: string;
        try { if ((await handle.stat()).size > 1024 * 1024) throw new Error("metadata-directory-invalid-state"); text = await handle.readFile("utf8"); }
        finally { await handle.close(); }
        if (Buffer.byteLength(text) > 1024 * 1024) throw new Error("metadata-directory-invalid-state");
        const value: unknown = JSON.parse(text);
        if (!valid(value)) throw new Error("metadata-directory-invalid-state");
        return value;
      } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new Error("metadata-directory-state-unavailable"); }
    },
    save(value) {
      const snapshot = structuredClone(value);
      if (!valid(snapshot)) return Promise.reject(new Error("metadata-directory-invalid-state"));
      const json = JSON.stringify(snapshot);
      if (Buffer.byteLength(json) > 1024 * 1024) return Promise.reject(new Error("metadata-directory-invalid-state"));
      const save = writing.catch(() => undefined).then(async () => {
        await mkdir(path.dirname(file), { recursive: true });
        const temporary = `${file}.${randomBytes(12).toString("hex")}.tmp`, handle = await open(temporary, "wx", 0o600);
        try {
          try { await handle.writeFile(json, "utf8"); await handle.sync(); } finally { await handle.close(); }
          await rename(temporary, file);
        } finally { await unlink(temporary).catch(() => undefined); }
      });
      writing = save; return save;
    }
  };
};
