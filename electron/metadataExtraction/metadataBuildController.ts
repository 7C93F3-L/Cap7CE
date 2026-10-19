import type { CoreMetadataCursor, CoreMetadataPolicy, CoreMetadataProtocol } from "../core/coreMetadataProtocol";
import { supportedImageDimensionExtensions } from "../imageDimensionTypes";
import { CORE_IMAGE_METADATA_EXTRACTOR_VERSION } from "./imageMetadataMetrics";
import { supportedVideoFactExtensions } from "../videoFactTypes";
import { CORE_VIDEO_METADATA_EXTRACTOR_VERSION as VIDEO_FACT_EXTRACTOR_VERSION } from "./videoMetadataFrames";
import { AUDIO_FACT_EXTRACTOR_VERSION, supportedAudioFactExtensions } from "../audioFactTypes";
import { FONT_FACT_EXTRACTOR_VERSION, supportedFontFactExtensions } from "../fontFactTypes";
import { MODEL_FACT_EXTRACTOR_VERSION, supportedModelFactExtensions } from "../modelFactTypes";
import { DOCUMENT_FACT_EXTRACTOR_VERSION, supportedDocumentFactExtensions } from "../documentFactTypes";
import { THREE_D_FACT_EXTRACTOR_VERSION, supportedThreeDFactExtensions } from "../threeDFactTypes";
import { ARCHIVE_FACT_EXTRACTOR_VERSION, supportedArchiveFactExtensions } from "../archiveFactTypes";
import { TEXT_DATA_FACT_EXTRACTOR_VERSION, supportedTextDataFactExtensions } from "../textDataFactTypes";
import { MetadataBuildEstimate, metadataBuildDelay, type MetadataBuildPhase, type MetadataBuildProgress } from "./metadataBuildProgress";
import { discoverMetadataChanges } from "./metadataChangeDiscovery";

export interface MetadataBuildSpecification { kind: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; extractorVersion: number; extensions: readonly string[] }
const defaultSpecifications: readonly MetadataBuildSpecification[] = [
  { kind: 0, extractorVersion: CORE_IMAGE_METADATA_EXTRACTOR_VERSION, extensions: supportedImageDimensionExtensions },
  { kind: 1, extractorVersion: VIDEO_FACT_EXTRACTOR_VERSION, extensions: supportedVideoFactExtensions },
  { kind: 2, extractorVersion: AUDIO_FACT_EXTRACTOR_VERSION, extensions: supportedAudioFactExtensions },
  { kind: 3, extractorVersion: FONT_FACT_EXTRACTOR_VERSION, extensions: supportedFontFactExtensions },
  { kind: 4, extractorVersion: MODEL_FACT_EXTRACTOR_VERSION, extensions: supportedModelFactExtensions },
  { kind: 5, extractorVersion: DOCUMENT_FACT_EXTRACTOR_VERSION, extensions: supportedDocumentFactExtensions },
  { kind: 6, extractorVersion: THREE_D_FACT_EXTRACTOR_VERSION, extensions: supportedThreeDFactExtensions },
  { kind: 7, extractorVersion: TEXT_DATA_FACT_EXTRACTOR_VERSION, extensions: supportedTextDataFactExtensions },
  { kind: 8, extractorVersion: ARCHIVE_FACT_EXTRACTOR_VERSION, extensions: supportedArchiveFactExtensions }
];
type Protocol = Pick<CoreMetadataProtocol, "configure" | "pause" | "discover" | "consumeChanges" | "claim" | "status" | "execute">;
export interface MetadataBuildOptions {
  onProgress?: (progress: MetadataBuildProgress) => void;
  specifications?: readonly MetadataBuildSpecification[];
  yieldMs?: number;
  waitMs?: number;
}

// Owns one explicit build sweep. No filesystem enumeration, database access or idle polling.
export class MetadataBuildController {
  private progress: MetadataBuildProgress = { phase: "idle", volumeId: null, discovered: 0, processed: 0,
    failed: 0, unsupported: 0, total: null, progressFraction: null, remainingSeconds: null, errorCode: null };
  private running?: Promise<void>;
  private pausing?: Promise<MetadataBuildProgress>;
  private cancellation?: AbortController;
  private fingerprint?: string;
  private moreChanges = false;
  constructor(private readonly protocol: Protocol, private readonly options: MetadataBuildOptions = {}) {}

  snapshot(): MetadataBuildProgress { return { ...this.progress }; }
  hasPendingChanges(): boolean { return this.moreChanges; }
  start(policy: CoreMetadataPolicy, allowMetadataExtraction: boolean): MetadataBuildProgress {
    return this.begin(policy, allowMetadataExtraction, false);
  }
  startChanges(policy: CoreMetadataPolicy, allowMetadataExtraction: boolean): MetadataBuildProgress {
    return this.begin(policy, allowMetadataExtraction, true);
  }
  private begin(policy: CoreMetadataPolicy, allowMetadataExtraction: boolean, changesOnly: boolean): MetadataBuildProgress {
    if (allowMetadataExtraction !== true) throw new Error("metadata-build-confirmation-required");
    if (this.running || this.pausing) throw new Error("metadata-build-busy");
    const saved: CoreMetadataPolicy = JSON.parse(JSON.stringify(policy));
    if (!Array.isArray(saved.volumeOrder) || !Array.isArray(saved.includes) || !Array.isArray(saved.excludes) ||
      saved.volumeOrder.length > 64 || saved.volumeOrder.some((volume) => typeof volume !== "string") ||
      new Set(saved.volumeOrder).size !== saved.volumeOrder.length ||
      [...saved.includes, ...saved.excludes].some((scope) => !scope || typeof scope.volumeId !== "string" ||
        (scope.rootFileReference !== null && typeof scope.rootFileReference !== "string"))) throw new Error("metadata-build-invalid-policy");
    const specifications = (this.options.specifications ?? defaultSpecifications).map((item) => ({ ...item, extensions: [...item.extensions] }));
    if (specifications.length === 0 || specifications.some((item) => ![0, 1, 2, 3, 4, 5, 6, 7, 8].includes(item.kind) ||
      !Number.isSafeInteger(item.extractorVersion) || item.extractorVersion < 1 || item.extensions.length === 0) ||
      new Set(specifications.map((item) => item.kind)).size !== specifications.length) throw new Error("metadata-build-invalid-specification");
    const fingerprint = JSON.stringify({ saved, specifications, changesOnly });
    const resumed = this.progress.phase === "paused" && fingerprint === this.fingerprint;
    this.fingerprint = fingerprint;
    this.moreChanges = false;
    this.progress = { ...this.progress, phase: "preparing", volumeId: null, discovered: resumed ? this.progress.processed : 0,
      processed: resumed ? this.progress.processed : 0, failed: resumed ? this.progress.failed : 0,
      unsupported: resumed ? this.progress.unsupported : 0, total: null, progressFraction: null, remainingSeconds: null, errorCode: null };
    const cancellation = new AbortController();
    this.cancellation = cancellation;
    this.emit();
    this.running = this.run(saved, specifications, cancellation.signal, changesOnly).finally(() => { this.running = undefined; });
    return this.snapshot();
  }
  async waitForIdle(): Promise<MetadataBuildProgress> { await this.running; return this.snapshot(); }
  pause(): Promise<MetadataBuildProgress> {
    if (this.pausing) return this.pausing;
    if (!this.running || ["idle", "completed", "failed", "paused"].includes(this.progress.phase)) return Promise.resolve(this.snapshot());
    const running = this.running;
    this.update("pausing");
    this.cancellation?.abort();
    this.pausing = (async () => {
      try { await this.protocol.pause(); await running; this.update("paused"); }
      catch { this.progress.errorCode = "metadata-control-failed"; this.update("failed"); }
      finally { this.pausing = undefined; }
      return this.snapshot();
    })();
    return this.pausing;
  }
  private async run(policy: CoreMetadataPolicy, specifications: readonly MetadataBuildSpecification[], signal: AbortSignal, changesOnly: boolean): Promise<void> {
    const remaining = new Map<number, number>();
    const estimate = new MetadataBuildEstimate();
    const volumes = policy.volumeOrder.filter((volume) => policy.includes.some((scope) => scope.volumeId === volume) &&
      !policy.excludes.some((scope) => scope.volumeId === volume && scope.rootFileReference === null));
    try {
      await this.protocol.configure(policy, true, signal);
      if (changesOnly) {
        this.update("discovering");
        const changed = await discoverMetadataChanges(this.protocol, policy, specifications, signal, this.options.yieldMs ?? 15);
        this.moreChanges = changed.hasMore;
        this.progress.discovered += changed.discovered;
        for (const [kind, count] of changed.remaining) remaining.set(kind, count);
        this.emit();
      } else for (const volumeId of volumes) {
        this.progress.volumeId = volumeId;
        await this.awaitAvailable(volumeId, specifications, signal);
        for (const specification of specifications) {
          let after: CoreMetadataCursor | null = null;
          do {
            signal.throwIfAborted();
            this.update("discovering");
            const page = await this.protocol.discover(specification.kind, specification.extractorVersion, specification.extensions, after, volumeId, signal);
            this.progress.discovered += page.jobs.length;
            remaining.set(specification.kind, (remaining.get(specification.kind) ?? 0) + page.jobs.length);
            after = page.next;
            this.emit();
            await metadataBuildDelay(this.options.yieldMs ?? 15, signal);
          } while (after);
        }
      }
      this.progress.total = this.progress.discovered;
      for (const volumeId of volumes) {
        this.progress.volumeId = volumeId;
        while (true) {
          signal.throwIfAborted();
          if (changesOnly) {
            const status = await this.protocol.status(specifications[0].kind, specifications[0].extractorVersion, volumeId, signal);
            if (status.state !== "active" || !status.ledger) throw new Error("metadata-session-inactive");
            if (status.ledger.unavailableVolumeIds?.includes(volumeId)) break;
          } else await this.awaitAvailable(volumeId, specifications, signal);
          const claimed = await this.protocol.claim({ volumeId, extractors: specifications.map(({ kind, extractorVersion }) => ({ kind, extractorVersion })) }, signal);
          if (claimed.state !== 0) {
            const pending = await this.readPending(volumeId, specifications, signal);
            if (claimed.state === 1 && pending === 0) break;
            this.update("waiting");
            await metadataBuildDelay(this.options.waitMs ?? 1000, signal);
            continue;
          }
          this.update("extracting");
          const ticket = claimed.ticket!;
          const began = Date.now();
          const result = await this.protocol.execute(ticket.lease.leaseId, signal);
          signal.throwIfAborted();
          const completion = result.completion;
          if (completion === 0 || completion === 4) {
            this.progress.processed += 1;
            if (result.state === "failed") this.progress.failed += 1;
            if (result.state === "unsupported") this.progress.unsupported += 1;
            this.progress.total = Math.max(this.progress.total!, this.progress.processed);
            remaining.set(ticket.lease.job.kind, Math.max(0, (remaining.get(ticket.lease.job.kind) ?? 0) - 1));
            estimate.add(ticket.lease.job.kind, Date.now() - began + (this.options.yieldMs ?? 15));
            this.progress.remainingSeconds = estimate.remaining(remaining);
            this.emit();
          }
          await metadataBuildDelay(this.options.yieldMs ?? 15, signal);
        }
      }
      this.progress.volumeId = null;
      this.progress.remainingSeconds = 0;
      this.update("completed");
    } catch {
      if (signal.aborted) this.update("paused");
      else {
        // Revoke this session's remaining leases so a later explicit retry does not wait for expiry.
        try { await this.protocol.pause(); } catch { /* The failed bridge may already be unavailable. */ }
        this.progress.errorCode = "metadata-build-failed"; this.update("failed");
      }
    }
  }
  private async awaitAvailable(volumeId: string, specifications: readonly MetadataBuildSpecification[], signal: AbortSignal): Promise<void> {
    while (true) {
      const status = await this.protocol.status(specifications[0].kind, specifications[0].extractorVersion, volumeId, signal);
      if (status.state !== "active") throw new Error("metadata-session-inactive");
      if (!status.ledger?.unavailableVolumeIds?.includes(volumeId)) return;
      this.update("waiting");
      await metadataBuildDelay(this.options.waitMs ?? 1000, signal);
    }
  }
  private async readPending(volumeId: string, specifications: readonly MetadataBuildSpecification[], signal: AbortSignal): Promise<number> {
    let pending = 0;
    for (const specification of specifications) {
      const status = await this.protocol.status(specification.kind, specification.extractorVersion, volumeId, signal);
      if (status.state !== "active" || !status.ledger) throw new Error("metadata-session-inactive");
      if (status.ledger.unavailableVolumeIds?.includes(volumeId)) return 1;
      pending += status.ledger.pendingJobs + status.ledger.leasedJobs;
    }
    return pending;
  }
  private update(phase: MetadataBuildPhase): void {
    this.progress.phase = phase;
    if (phase !== "extracting" && phase !== "completed") this.progress.remainingSeconds = null;
    this.emit();
  }
  private emit(): void {
    const total = this.progress.total;
    this.progress.progressFraction = this.progress.phase === "completed" ? 1 : total === null ? null : total === 0 ? 0 : Math.min(1, this.progress.processed / total);
    this.options.onProgress?.(this.snapshot());
  }
}
