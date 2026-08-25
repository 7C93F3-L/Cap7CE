import path from "node:path";
import { Worker } from "node:worker_threads";
import { ANIMATION_FACT_EXTRACTOR_VERSION, type AnimationFactCandidate, type AnimationFactResult, type AnimationFactWriteRecord } from "./animationFactTypes";

interface WorkerLike {
  on(event: "message" | "error" | "exit", listener: (...args: any[]) => void): this;
  postMessage(value: unknown): void;
  terminate(): Promise<number>;
  unref?(): void;
}

export const createAnimationFactService = ({
  listPendingCandidates,
  writeBatch,
  createWorker = () => new Worker(path.join(__dirname, "animationFactWorker.js")),
  initialDelayMs = 250,
  yieldMs = 10,
  foregroundYieldMs = 500,
  writeBatchSize = 24
}: {
  listPendingCandidates: (directoryIds?: string[]) => Promise<AnimationFactCandidate[]>;
  writeBatch: (records: AnimationFactWriteRecord[]) => Promise<number>;
  createWorker?: () => WorkerLike;
  initialDelayMs?: number;
  yieldMs?: number;
  foregroundYieldMs?: number;
  writeBatchSize?: number;
}) => {
  let queue: AnimationFactCandidate[] = [];
  const revisions = new Map<string, string>();
  const discarded = new Set<string>();
  let worker: WorkerLike | null = null;
  let active: AnimationFactCandidate | null = null;
  let resolveActive: ((result: AnimationFactResult) => void) | null = null;
  let requestId = 0;
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<void> | null = null;
  let foreground = false;
  const key = (filePath: string) => path.resolve(filePath).toLowerCase();

  const failure = (candidate: AnimationFactCandidate, errorCode: string): AnimationFactResult => ({
    sourceRevision: candidate.sourceRevision,
    extractorVersion: ANIMATION_FACT_EXTRACTOR_VERSION,
    status: "failed",
    isAnimated: false,
    errorCode
  });
  const ensureWorker = () => {
    if (worker) return;
    const created = createWorker();
    created.unref?.();
    worker = created;
    created.on("message", (message: { id?: number; result?: AnimationFactResult }) => {
      if (worker !== created || message.id !== requestId || !message.result) return;
      const resolve = resolveActive;
      resolveActive = null;
      resolve?.(message.result);
    });
    const fail = (code: string) => {
      if (worker !== created) return;
      const resolve = resolveActive;
      resolveActive = null;
      worker = null;
      if (resolve && active) resolve(failure(active, code));
    };
    created.on("error", () => fail("animation-fact-worker-failed"));
    created.on("exit", (code: number) => { if (code !== 0 || resolveActive) fail("animation-fact-worker-exited"); });
  };
  const inspect = (candidate: AnimationFactCandidate) => new Promise<AnimationFactResult>((resolve) => {
    ensureWorker();
    resolveActive = resolve;
    requestId += 1;
    worker?.postMessage({ id: requestId, ...candidate });
  });
  const schedule = () => {
    if (running || timer || queue.length === 0) return;
    timer = setTimeout(() => { timer = null; running = run(); }, initialDelayMs);
    timer.unref?.();
  };
  const run = async () => {
    const writes: AnimationFactWriteRecord[] = [];
    const flush = async () => { if (writes.length) await writeBatch(writes.splice(0)); };
    try {
      while (queue.length) {
        const candidate = queue.shift();
        if (!candidate || revisions.get(key(candidate.filePath)) !== candidate.sourceRevision) continue;
        active = candidate;
        const result = await inspect(candidate);
        const pathKey = key(candidate.filePath);
        const current = revisions.get(pathKey) === candidate.sourceRevision;
        if (current) revisions.delete(pathKey);
        active = null;
        if (current && !discarded.delete(pathKey)) writes.push({ filePath: candidate.filePath, result });
        else discarded.delete(pathKey);
        if (writes.length >= writeBatchSize) await flush();
        const delayMs = foreground ? foregroundYieldMs : yieldMs;
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      await flush();
    } catch {
      // A later scan or application restart will rediscover unwritten candidates.
    } finally {
      active = null;
      running = null;
      if (queue.length) schedule();
    }
  };
  const append = (candidates: AnimationFactCandidate[]) => {
    for (const candidate of candidates) {
      const pathKey = key(candidate.filePath);
      if (revisions.get(pathKey) === candidate.sourceRevision) continue;
      queue = queue.filter((item) => key(item.filePath) !== pathKey);
      revisions.set(pathKey, candidate.sourceRevision);
      queue.push(candidate);
    }
    schedule();
  };
  const discardWhere = (match: (filePath: string) => boolean) => {
    queue = queue.filter((candidate) => {
      if (!match(candidate.filePath)) return true;
      revisions.delete(key(candidate.filePath));
      return false;
    });
    if (active && match(active.filePath)) discarded.add(key(active.filePath));
  };
  return {
    enqueueDirectories: async (directoryIds: string[]) => append(await listPendingCandidates(directoryIds)),
    discardDirectory: (directoryPath: string) => discardWhere((filePath) => {
      const relative = path.relative(path.resolve(directoryPath), path.resolve(filePath));
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    }),
    setForegroundActive: (value: boolean) => { foreground = value; schedule(); },
    shutdown: async () => { if (timer) clearTimeout(timer); queue = []; revisions.clear(); await worker?.terminate(); worker = null; }
  };
};
