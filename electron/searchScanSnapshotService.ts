import type { PersistedDirectory } from "./directoryStore";
import { scanImageDirectories, type ImageScanResult } from "./imageScanner";

export const SEARCH_SCAN_SNAPSHOT_TTL_MS = 15_000;

interface SnapshotEntry {
  directoryPath: string;
  completedAt: number;
  result: ImageScanResult;
}

interface InFlightEntry {
  directoryPath: string;
  cancelled: boolean;
  promise: Promise<ImageScanResult>;
}

const cancelledError = () => Object.assign(new Error("Search scan cancelled."), { code: "ECANCELED" });

export class SearchScanSnapshotService {
  private readonly snapshots = new Map<string, SnapshotEntry>();
  private readonly inFlight = new Map<string, InFlightEntry>();
  private active = true;
  private scanQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly scan: typeof scanImageDirectories = scanImageDirectories,
    private readonly now: () => number = Date.now,
    private readonly ttlMs = SEARCH_SCAN_SNAPSHOT_TTL_MS
  ) {}

  setActive(active: boolean) {
    this.active = active;
    if (active) return;
    for (const task of this.inFlight.values()) task.cancelled = true;
    this.snapshots.clear();
  }

  invalidate(directoryIds?: Iterable<string>) {
    const ids = directoryIds ? [...directoryIds] : [...new Set([...this.snapshots.keys(), ...this.inFlight.keys()])];
    for (const directoryId of ids) {
      this.snapshots.delete(directoryId);
      const task = this.inFlight.get(directoryId);
      if (task) task.cancelled = true;
    }
  }

  seed(directories: PersistedDirectory[], result: ImageScanResult) {
    const directoryById = new Map(directories.map((directory) => [directory.id, directory]));
    for (const directoryResult of result.directories) {
      const directory = directoryById.get(directoryResult.directory_id);
      if (!directory) continue;
      this.snapshots.set(directory.id, {
        directoryPath: directory.path,
        completedAt: this.now(),
        result: {
          scannedAt: result.scannedAt,
          directories: [directoryResult],
          files: result.files.filter((file) => file.directory_id === directory.id),
          images: result.images.filter((image) => image.directory_id === directory.id),
          summaries: result.summaries.filter((summary) => summary.id === directory.id)
        }
      });
    }
  }

  async get(directories: PersistedDirectory[], isCancelled: () => boolean = () => false): Promise<ImageScanResult> {
    const parts: ImageScanResult[] = [];
    for (const directory of directories) {
      if (isCancelled()) throw cancelledError();
      parts.push(await this.getDirectory(directory));
    }
    if (isCancelled()) throw cancelledError();
    const scannedTimes = parts.map((part) => part.scannedAt).sort();
    return {
      scannedAt: scannedTimes[scannedTimes.length - 1] ?? new Date().toISOString(),
      directories: parts.flatMap((part) => part.directories),
      files: parts.flatMap((part) => part.files),
      images: parts.flatMap((part) => part.images),
      summaries: parts.flatMap((part) => part.summaries)
    };
  }

  private getDirectory(directory: PersistedDirectory) {
    const snapshot = this.snapshots.get(directory.id);
    if (
      snapshot
      && snapshot.directoryPath === directory.path
      && this.now() - snapshot.completedAt < this.ttlMs
    ) {
      return Promise.resolve(snapshot.result);
    }

    const existingTask = this.inFlight.get(directory.id);
    if (existingTask?.directoryPath === directory.path && !existingTask.cancelled) {
      return existingTask.promise;
    }
    if (!this.active) return Promise.reject(cancelledError());

    const task = {} as InFlightEntry;
    task.directoryPath = directory.path;
    task.cancelled = false;
    task.promise = new Promise<ImageScanResult>((resolve, reject) => {
      const run = async () => {
        if (!this.active || task.cancelled) throw cancelledError();
        const result = await this.scan([directory], { isCancelled: () => !this.active || task.cancelled });
        if (!this.active || task.cancelled) throw cancelledError();
        this.seed([directory], result);
        return result;
      };
      const queued = this.scanQueue.then(run, run);
      this.scanQueue = queued.then(() => undefined, () => undefined);
      queued.then(resolve, reject).finally(() => {
        if (this.inFlight.get(directory.id) === task) this.inFlight.delete(directory.id);
      });
    });
    this.inFlight.set(directory.id, task);
    return task.promise;
  }
}

export const searchScanSnapshotService = new SearchScanSnapshotService();
