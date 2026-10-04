import path from "node:path";
import type { ModelFactCandidate, ModelFactResult, ModelFactWriteRecord } from "./modelFactTypes";

const pathKey = (filePath: string) => path.resolve(filePath).toLowerCase();
export const createModelFactService = ({ listPendingCandidates, inspectBatch, writeBatch, initialDelayMs = 3_000, yieldMs = 500, foregroundYieldMs = 3_000 }: {
  listPendingCandidates: (directoryIds?: string[]) => Promise<ModelFactCandidate[]>;
  inspectBatch: (candidates: ModelFactCandidate[]) => Promise<ModelFactResult[]>;
  writeBatch: (records: ModelFactWriteRecord[]) => Promise<number>;
  initialDelayMs?: number; yieldMs?: number; foregroundYieldMs?: number;
}) => {
  let queue: ModelFactCandidate[] = [];
  const revisions = new Map<string, string>();
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<void> | null = null;
  let foreground = false;
  const schedule = () => {
    if (running || timer || queue.length === 0) return;
    timer = setTimeout(() => { timer = null; running = run(); }, initialDelayMs);
    timer.unref?.();
  };
  const run = async () => {
    try {
      while (queue.length > 0) {
        const candidate = queue.shift();
        if (!candidate || revisions.get(pathKey(candidate.filePath)) !== candidate.sourceRevision) continue;
        const result = (await inspectBatch([candidate]))[0];
        const key = pathKey(candidate.filePath);
        if (result && revisions.get(key) === candidate.sourceRevision) {
          revisions.delete(key);
          await writeBatch([{ filePath: candidate.filePath, result }]);
        }
        const delayMs = foreground ? foregroundYieldMs : yieldMs;
        if (delayMs > 0 && queue.length > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch { /* A later scan or restart will rediscover unwritten candidates. */ }
    finally { running = null; if (queue.length > 0) schedule(); }
  };
  const append = (candidates: ModelFactCandidate[]) => {
    for (const candidate of candidates) {
      const key = pathKey(candidate.filePath);
      if (revisions.get(key) === candidate.sourceRevision) continue;
      queue = queue.filter((queued) => pathKey(queued.filePath) !== key);
      revisions.set(key, candidate.sourceRevision);
      queue.push(candidate);
    }
    schedule();
  };
  const discardWhere = (match: (filePath: string) => boolean) => {
    queue = queue.filter((candidate) => {
      if (!match(candidate.filePath)) return true;
      revisions.delete(pathKey(candidate.filePath));
      return false;
    });
    for (const key of revisions.keys()) if (match(key)) revisions.delete(key);
  };
  return {
    enqueueDirectories: async (directoryIds: string[]) => append(await listPendingCandidates(directoryIds)),
    discardDirectory: (directoryPath: string) => discardWhere((filePath) => {
      const relative = path.relative(path.resolve(directoryPath), path.resolve(filePath));
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    }),
    setForegroundActive: (value: boolean) => { foreground = value; schedule(); },
    shutdown: () => { if (timer) clearTimeout(timer); timer = null; queue = []; revisions.clear(); }
  };
};
