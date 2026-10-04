import path from "node:path";
import { VISUAL_PROPERTY_ANALYZER_VERSION, type VisualPropertyAnalysisCandidate, type VisualPropertyIndexRecord } from "./visualPropertyTypes";
import type { VideoColorCandidate, VideoColorWriteRecord } from "./videoColorTypes";

const pathKey = (filePath: string) => path.resolve(filePath).toLowerCase();
const isInsideDirectory = (filePath: string, directoryPath: string) => {
  const relative = path.relative(path.resolve(directoryPath), path.resolve(filePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
const failureCode = (error: unknown) => {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return code ? `video-thumbnail-${code.toLowerCase()}` : "video-thumbnail-unavailable";
};

export const createVideoColorService = ({
  listPendingCandidates,
  ensureThumbnailPath,
  enqueueAnalysis,
  writeBatch,
  initialDelayMs = 2_500,
  yieldMs = 250,
  foregroundYieldMs = 2_500
}: {
  listPendingCandidates: (directoryIds?: string[]) => Promise<VideoColorCandidate[]>;
  ensureThumbnailPath: (filePath: string) => Promise<string>;
  enqueueAnalysis: (candidate: VisualPropertyAnalysisCandidate) => boolean;
  writeBatch: (records: VideoColorWriteRecord[]) => Promise<number>;
  initialDelayMs?: number;
  yieldMs?: number;
  foregroundYieldMs?: number;
}) => {
  let queue: VideoColorCandidate[] = [];
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
        if (!candidate) continue;
        const key = pathKey(candidate.filePath);
        if (revisions.get(key) !== candidate.sourceRevision) continue;
        try {
          const thumbnailPath = await ensureThumbnailPath(candidate.filePath);
          if (revisions.get(key) === candidate.sourceRevision) {
            enqueueAnalysis({ ...candidate, thumbnailPath });
          }
        } catch (error) {
          if (revisions.get(key) === candidate.sourceRevision) {
            const record: VisualPropertyIndexRecord = {
              sourceRevision: candidate.sourceRevision,
              analyzerVersion: VISUAL_PROPERTY_ANALYZER_VERSION,
              status: "failed",
              properties: null,
              errorCode: failureCode(error)
            };
            await writeBatch([{ filePath: candidate.filePath, record }]);
          }
        } finally {
          if (revisions.get(key) === candidate.sourceRevision) revisions.delete(key);
        }
        const delayMs = foreground ? foregroundYieldMs : yieldMs;
        if (delayMs > 0 && queue.length > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch {
      // A later directory scan or application restart rediscovers unwritten candidates.
    } finally {
      running = null;
      if (queue.length > 0) schedule();
    }
  };
  const append = (candidates: VideoColorCandidate[]) => {
    for (const candidate of candidates) {
      const key = pathKey(candidate.filePath);
      if (revisions.get(key) === candidate.sourceRevision) continue;
      queue = queue.filter((queued) => pathKey(queued.filePath) !== key);
      revisions.set(key, candidate.sourceRevision);
      queue.push(candidate);
    }
    schedule();
  };
  const discardWhere = (matches: (filePath: string) => boolean) => {
    queue = queue.filter((candidate) => {
      if (!matches(candidate.filePath)) return true;
      revisions.delete(pathKey(candidate.filePath));
      return false;
    });
    for (const key of revisions.keys()) {
      if (matches(key)) revisions.delete(key);
    }
  };
  return {
    enqueueDirectories: async (directoryIds: string[]) => append(await listPendingCandidates(directoryIds)),
    discardDirectory: (directoryPath: string) => discardWhere((filePath) => isInsideDirectory(filePath, directoryPath)),
    setForegroundActive: (value: boolean) => { foreground = value; schedule(); },
    shutdown: () => { if (timer) clearTimeout(timer); timer = null; queue = []; revisions.clear(); }
  };
};
