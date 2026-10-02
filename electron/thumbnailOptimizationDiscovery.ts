import {
  beginThumbnailOptimizationDiscovery,
  enqueueThumbnailOptimizationCandidates,
  getThumbnailOptimizationStatus,
  type ThumbnailOptimizationCandidate
} from "./thumbnailOptimizationService";

type CandidateDiscovery<TDirectory> = (
  directories: TDirectory[],
  isCancelled: () => boolean,
  yieldForBackgroundWork: () => Promise<void>
) => Promise<ThumbnailOptimizationCandidate[]>;

const foregroundDiscoveryBatchSize = 16;
const backgroundDiscoveryBatchSize = 256;
const foregroundDiscoveryYieldMs = 40;

export class ThumbnailOptimizationDiscovery<TDirectory> {
  private queue: Promise<void> = Promise.resolve();
  private foregroundActive = false;
  private entriesSinceYield = 0;

  constructor(private readonly discoverCandidates: CandidateDiscovery<TDirectory>) {}

  setForegroundActive(active: boolean) {
    if (this.foregroundActive === active) return;
    this.foregroundActive = active;
    this.entriesSinceYield = 0;
  }

  private readonly yieldForBackgroundWork = async () => {
    this.entriesSinceYield += 1;
    const batchSize = this.foregroundActive
      ? foregroundDiscoveryBatchSize
      : backgroundDiscoveryBatchSize;
    if (this.entriesSinceYield < batchSize) return;
    this.entriesSinceYield = 0;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, this.foregroundActive ? foregroundDiscoveryYieldMs : 0);
    });
  };

  schedule(directories: TDirectory[]) {
    if (directories.length === 0 || !getThumbnailOptimizationStatus().enabled) return;
    const finishDiscovery = beginThumbnailOptimizationDiscovery();
    const task = this.queue.then(async () => {
      try {
        if (!getThumbnailOptimizationStatus().enabled) return;
        const candidates = await this.discoverCandidates(
          directories,
          () => !getThumbnailOptimizationStatus().enabled,
          this.yieldForBackgroundWork
        );
        await enqueueThumbnailOptimizationCandidates(candidates);
      } finally {
        finishDiscovery();
      }
    });
    this.queue = task.catch((error) => {
      if ((error as NodeJS.ErrnoException)?.code !== "ECANCELED") {
        console.warn("[thumbnail-optimization] added directory scan failed", error);
      }
    });
  }

  async waitForIdle() {
    await this.queue;
  }
}
