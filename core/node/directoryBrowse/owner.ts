import path from "node:path";
import { readSkimLocation, type SkimBrowseEntry } from "./source/skimBrowseService";
import type { DirectoryBrowseOptions, DirectoryBrowsePage } from "../../../src/shared/directoryBrowseTypes";
import { randomUUID } from "node:crypto";
import { RecursiveDirectoryListing } from "./recursive";

interface Job { cancelled: boolean; ready: boolean; entries: SkimBrowseEntry[]; cursor: string | null; offset: number; work: Promise<void>; recursive?: RecursiveDirectoryListing; }
export function createDirectoryBrowseOwner() {
  const jobs = new Map<string, Job>(); let closed = false, releasing = false;
  const invalid = (): never => { throw Error("directory-browse-invalid-request"); };
  const page = async (id: string, job: Job): Promise<DirectoryBrowsePage> => {
    if (job.recursive) {
      job.ready = false;
      job.work = job.recursive.read().then(entries => { job.entries = entries; job.offset = 0; });
      try { await job.work; } catch (error) { jobs.delete(id); throw error; } finally { job.ready = true; }
    }
    if (job.cancelled) throw Error("directory-browse-cancelled");
    const entries = job.entries.slice(job.offset, job.offset + 100); job.offset += entries.length;
    job.cursor = (job.recursive ? job.recursive.hasMore : job.offset < job.entries.length) ? randomUUID() : null;
    if (job.cursor === null) jobs.delete(id);
    return { entries, nextCursor: job.cursor, isComplete: job.cursor === null, totalCount: job.recursive?.totalCount ?? job.entries.length };
  };
  const release = async () => {
    releasing = true; const current = [...jobs.values()]; for (const job of current) job.cancelled = true;
    await Promise.allSettled(current.map(job => job.work)); jobs.clear(); releasing = false;
  };
  return {
    async dispatch(method: string, args: unknown[]) {
      if (closed || releasing || !Array.isArray(args) || typeof args[0] !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(args[0])) return invalid();
      const id = args[0], job = jobs.get(id);
      if (method === "directoryBrowse.cancel") { if (args.length !== 1) return invalid(); if (job) { job.cancelled = true; await job.work.catch(() => {}); jobs.delete(id); } return null; }
      if (method === "directoryBrowse.next") {
        if (args.length !== 2 || !job || !job.ready || typeof args[1] !== "string" || args[1] !== job.cursor || job.cancelled) return invalid();
        return page(id, job);
      }
      if (method !== "directoryBrowse.start" || args.length !== 3 || job) return invalid();
      const root = args[1], options = args[2] as DirectoryBrowseOptions;
      if (typeof root !== "string" || root.length > 32767 || root.includes("\0") || !path.isAbsolute(root) || root.startsWith("\\\\")
        || !options || typeof options !== "object" || Array.isArray(options) || !["name-ascending", "name-descending", "modified-ascending", "modified-descending"].includes(options.sort)
        || typeof options.excludeHidden !== "boolean" || options.includeSubfolders !== undefined && typeof options.includeSubfolders !== "boolean"
        || Object.keys(options).some(key => !["sort", "excludeHidden", "fileConditions", "includeSubfolders"].includes(key))) return invalid();
      if (jobs.size >= 4) { const retired = [...jobs].find(([, item]) => item.ready); if (!retired) return invalid(); jobs.delete(retired[0]); }
      const next: Job = { cancelled: false, ready: false, entries: [], offset: 0, cursor: null, work: Promise.resolve() }; jobs.set(id, next);
      if (options.includeSubfolders) {
        next.recursive = new RecursiveDirectoryListing(root, options, () => next.cancelled);
        return page(id, next);
      }
      next.work = (async () => {
        const result = await readSkimLocation(root, () => next.cancelled, [], 65536, 32 * 1024 * 1024);
        if (next.cancelled || result.cancelled) throw Error("directory-browse-cancelled");
        const { filterDirectoryEntries, sortDirectoryEntries } = await import("./policy");
        next.entries = sortDirectoryEntries(filterDirectoryEntries(result.entries, options), options.sort);
      })();
      try { await next.work; next.ready = true; return page(id, next); }
      catch (error) { jobs.delete(id); throw error; }
    },
    release,
    async close() { closed = true; await release(); }
  };
}
