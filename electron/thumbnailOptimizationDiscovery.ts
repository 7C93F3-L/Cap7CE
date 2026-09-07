import {
  beginThumbnailOptimizationDiscovery,
  enqueueThumbnailOptimizationCandidates,
  getThumbnailOptimizationStatus,
  type ThumbnailOptimizationCandidate
} from "./thumbnailOptimizationService";

type CandidateDiscovery<TDirectory> = (
  directories: TDirectory[],
  isCancelled: () => boolean
) => Promise<ThumbnailOptimizationCandidate[]>;

export class ThumbnailOptimizationDiscovery<TDirectory> {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly discoverCandidates: CandidateDiscovery<TDirectory>) {}

  schedule(directories: TDirectory[]) {
    if (directories.length === 0 || !getThumbnailOptimizationStatus().enabled) return;
    const finishDiscovery = beginThumbnailOptimizationDiscovery();
    const task = this.queue.then(async () => {
      try {
        if (!getThumbnailOptimizationStatus().enabled) return;
        const candidates = await this.discoverCandidates(
          directories,
          () => !getThumbnailOptimizationStatus().enabled
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
