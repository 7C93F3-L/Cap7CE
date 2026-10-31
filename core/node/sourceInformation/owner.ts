import path from "node:path";
import { inspectSkimEntry } from "./inspection";
import { collectSkimFolderStats } from "./folderStats";
import type { FolderStatsSnapshot, SkimFolderStats, FolderStatsOptions } from "../../../core/shared/sourceInformationTypes";
const empty = (): SkimFolderStats => ({ fileCount: 0, folderCount: 0, totalSize: 0, skippedCount: 0, status: "scanning" });
interface Job { cancelled: boolean; snapshot: FolderStatsSnapshot; waiters: Set<(value: FolderStatsSnapshot) => void>; work: Promise<void>; }
export function createSourceInformationOwner() {
  const jobs = new Map<string, Job>(), inspections = new Set<Promise<unknown>>(); let closed = false, releasing: Promise<void> | undefined;
  const invalid = (): never => { throw Error("core-source-info-invalid-request"); };
  const file = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 32767 && !value.includes("\0") && path.isAbsolute(value) ? value : invalid();
  const id = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value : invalid();
  const snapshot = (job: Job): FolderStatsSnapshot => ({ ...job.snapshot, stats: { ...job.snapshot.stats } });
  const update = (job: Job, stats: SkimFolderStats, done = false) => { job.snapshot = { sequence: job.snapshot.sequence + 1, done, stats: { ...stats } }; for (const resolve of job.waiters) resolve(snapshot(job)); job.waiters.clear(); };
  const stop = async (job: Job) => { job.cancelled = true; await job.work; };
  const release = () => releasing ??= Promise.all([...jobs.values()].map(stop).concat([...inspections].map(work => work.then(() => undefined, () => undefined))))
    .then(() => { jobs.clear(); }).finally(() => { releasing = undefined; });
  return {
    async dispatch(method: string, args: unknown[]): Promise<unknown> {
      if (closed || releasing || !Array.isArray(args)) return invalid();
      if (method === "sourceInfo.inspect") {
        if (args.length !== 3 || !["file", "folder"].includes(String(args[1])) || !Array.isArray(args[2]) || args[2].length > 4096 || inspections.size >= 8) return invalid();
        const work = inspectSkimEntry(file(args[0]), args[1] as "file" | "folder", args[2].map(file)); inspections.add(work);
        try { return await work; } finally { inspections.delete(work); }
      }
      const key = id(args[0]);
      if (method === "sourceInfo.start") {
        if (args.length !== 3 || jobs.has(key) || jobs.size >= 4) throw Error("core-source-info-busy");
        const root = file(args[1]), options = args[2] as FolderStatsOptions;
        if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(key => !["directoryConcurrency", "progressIntervalMs"].includes(key))
          || options.directoryConcurrency !== undefined && (!Number.isInteger(options.directoryConcurrency) || options.directoryConcurrency < 1 || options.directoryConcurrency > 8)
          || options.progressIntervalMs !== undefined && (!Number.isFinite(options.progressIntervalMs) || options.progressIntervalMs < 0 || options.progressIntervalMs > 60000)) return invalid();
        const job: Job = { cancelled: false, snapshot: { sequence: 0, done: false, stats: empty() }, waiters: new Set(), work: Promise.resolve() }; jobs.set(key, job);
        job.work = Promise.resolve().then(() => collectSkimFolderStats(root, () => job.cancelled, stats => update(job, stats), options))
          .then(stats => update(job, stats, true), () => update(job, { ...job.snapshot.stats, skippedCount: job.snapshot.stats.skippedCount + 1, status: "cancelled" }, true));
        return snapshot(job);
      }
      const job = jobs.get(key);
      if (method === "sourceInfo.watch") {
        if (args.length !== 2 || !Number.isSafeInteger(args[1]) || Number(args[1]) < 0 || !job) return invalid();
        if (job.snapshot.sequence !== args[1] || job.snapshot.done) return snapshot(job);
        if (job.waiters.size >= 2) throw Error("core-source-info-busy"); return new Promise(resolve => job.waiters.add(resolve));
      }
      if (!["sourceInfo.cancel", "sourceInfo.release"].includes(method) || args.length !== 1) return invalid();
      if (job) { await stop(job); if (method === "sourceInfo.release") jobs.delete(key); }
      return null;
    },
    release,
    async close() { closed = true; await release(); }
  };
}
