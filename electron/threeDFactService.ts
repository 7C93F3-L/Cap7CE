import path from "node:path";
import type { ThreeDFactCandidate, ThreeDFactResult, ThreeDFactWriteRecord } from "./threeDFactTypes";

const pathKey = (filePath: string) => path.resolve(filePath).toLowerCase();

export const createThreeDFactService = ({
  listPendingCandidates,
  inspectBatch,
  writeBatch,
  batchSize = 4,
  initialDelayMs = 1_500,
  yieldMs = 200,
  foregroundYieldMs = 1_800
}: {
  listPendingCandidates: (directoryIds?: string[]) => Promise<ThreeDFactCandidate[]>;
  inspectBatch: (candidates: ThreeDFactCandidate[]) => Promise<ThreeDFactResult[]>;
  writeBatch: (records: ThreeDFactWriteRecord[]) => Promise<number>;
  batchSize?: number;
  initialDelayMs?: number;
  yieldMs?: number;
  foregroundYieldMs?: number;
}) => {
  let queue: ThreeDFactCandidate[] = [];
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
        const batch = queue.splice(0, batchSize).filter((candidate) => revisions.get(pathKey(candidate.filePath)) === candidate.sourceRevision);
        if (batch.length === 0) continue;
        const results = await inspectBatch(batch);
        const records: ThreeDFactWriteRecord[] = [];
        batch.forEach((candidate, index) => {
          const key = pathKey(candidate.filePath);
          if (revisions.get(key) !== candidate.sourceRevision || !results[index]) return;
          revisions.delete(key);
          records.push({ filePath: candidate.filePath, result: results[index] });
        });
        if (records.length > 0) await writeBatch(records);
        const delayMs = foreground ? foregroundYieldMs : yieldMs;
        if (delayMs > 0 && queue.length > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch {
      // A later scan or application restart will rediscover unwritten candidates.
    } finally {
      running = null;
      if (queue.length > 0) schedule();
    }
  };
  const append = (candidates: ThreeDFactCandidate[]) => {
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
