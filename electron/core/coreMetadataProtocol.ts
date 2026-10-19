import type { CoreProtocolClient } from "./coreProtocolClient";
import { requestCore } from "./coreAbortableRequest";
import type { MetadataWorkerResult, MetadataWorkerTask } from "../metadataExtraction/metadataWorkerTypes";
import type { MetadataBuildPolicy } from "../../src/shared/metadataBuildTypes";

export interface CoreMetadataIdentity { volumeId: string; fileReference: string }
export type CoreMetadataPolicy = MetadataBuildPolicy;
export interface CoreMetadataSource {
  sizeBytes: string; modifiedFileTime: string; volumeEpoch: string; contentRevision: string;
}
export interface CoreMetadataJob { identity: CoreMetadataIdentity; kind: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; extractorVersion: number }
export interface CoreMetadataSelection {
  extractors: { kind: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; extractorVersion: number }[];
  volumeId?: string;
}
export interface CoreMetadataTicket {
  fullPath: string;
  lease: { leaseId: string; job: CoreMetadataJob; source: CoreMetadataSource; expiresUnixMilliseconds: number };
}
export interface CoreMetadataClaim {
  state: 0 | 1 | 2 | 3 | 4;
  ticket: CoreMetadataTicket | null;
  retryAfterUnixMilliseconds: number | null;
}
export interface CoreMetadataCursor extends CoreMetadataIdentity { specificationHash: string }
export interface CoreMetadataDiscovery { jobs: CoreMetadataJob[]; next: CoreMetadataCursor | null }
export interface CoreMetadataChangeSpecification { kind: CoreMetadataJob["kind"]; extractorVersion: number; extensions: readonly string[] }
export interface CoreMetadataChangeStep { jobsDiscovered: number; acknowledged: boolean; hasMore: boolean }
export interface CoreMetadataStatus {
  state: "inactive" | "active" | "paused";
  ledger: null | { policyEpoch: number; pendingJobs: number; leasedJobs: number; completedJobs: number; nextLeaseExpiryUnixMilliseconds: number | null; unavailableVolumeIds?: string[] };
}
export interface CoreMetadataExecution { completion: 0 | 1 | 2 | 3 | 4; state: "indexed" | "unsupported" | "failed" | null }

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const safe = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const hex = (value: unknown, length: number) => typeof value === "string" && new RegExp(`^[0-9A-Fa-f]{${length}}$`).test(value);
const identity = (value: unknown): value is CoreMetadataIdentity => record(value) && hex(value.volumeId, 32) && hex(value.fileReference, 16);
const job = (value: unknown): value is CoreMetadataJob => record(value) && identity(value.identity) &&
  (value.kind === 0 || value.kind === 1 || value.kind === 2 || value.kind === 3 || value.kind === 4 || value.kind === 5 || value.kind === 6 || value.kind === 7 || value.kind === 8) && safe(value.extractorVersion) && Number(value.extractorVersion) > 0;
const source = (value: unknown): value is CoreMetadataSource => {
  if (!record(value)) return false;
  const keys = ["sizeBytes", "modifiedFileTime", "volumeEpoch", "contentRevision"];
  return Object.keys(value).length === 4 && keys.every((key) => {
    const field = value[key];
    return typeof field === "string" && /^(?:0|[1-9][0-9]{0,18})$/.test(field) && BigInt(field) <= 9223372036854775807n;
  });
};
const invalid = () => new Error("core-metadata-invalid-response");

// Reuse the authenticated Core session; this adapter never starts a Host or enables it implicitly.
export class CoreMetadataProtocol {
  constructor(private readonly client: Pick<CoreProtocolClient, "request"> & Partial<Pick<CoreProtocolClient, "startRequest" | "cancel">>) {}

  async configure(policy: CoreMetadataPolicy, allowMetadataExtraction: boolean, signal?: AbortSignal): Promise<CoreMetadataStatus> {
    if (allowMetadataExtraction !== true) throw new Error("core-metadata-confirmation-required");
    return this.validateStatus(await this.request("metadata.configure", { allowMetadataExtraction, policy }, 120_000, signal));
  }
  async pause(): Promise<CoreMetadataStatus> {
    return this.validateStatus(await this.request("metadata.pause", {}));
  }
  async status(kind: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, extractorVersion: number, volumeId?: string, signal?: AbortSignal): Promise<CoreMetadataStatus> {
    return this.validateStatus(await this.request("metadata.status", { kind, extractorVersion, volumeId }, 5000, signal));
  }
  async discover(kind: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, extractorVersion: number, extensions: readonly string[], after: CoreMetadataCursor | null, volumeId?: string, signal?: AbortSignal): Promise<CoreMetadataDiscovery> {
    const response = await this.request<unknown>("metadata.discover", { kind, extractorVersion, extensions, after, pageSize: 128, volumeId }, 30_000, signal);
    if (!record(response) || !Array.isArray(response.jobs) || response.jobs.length > 128 || !response.jobs.every(job) ||
      !response.jobs.every((item) => item.kind === kind && item.extractorVersion === extractorVersion && (!volumeId || item.identity.volumeId === volumeId)) ||
      (response.next !== null && (!identity(response.next) || !record(response.next) || !hex(response.next.specificationHash, 64)))) throw invalid();
    return response as unknown as CoreMetadataDiscovery;
  }
  async claim(specification?: CoreMetadataSelection, signal?: AbortSignal): Promise<CoreMetadataClaim> {
    const response = await this.request<unknown>("metadata.claim", specification ? { specification } : {}, 5000, signal);
    if (!record(response) || ![0, 1, 2, 3].includes(Number(response.state)) || typeof response.state !== "number" ||
      (response.retryAfterUnixMilliseconds !== null && !safe(response.retryAfterUnixMilliseconds))) throw invalid();
    if (response.state === 0) {
      const ticket = response.ticket;
      if (!record(ticket) || typeof ticket.fullPath !== "string" || !/^[a-z]:[\\/]/i.test(ticket.fullPath) ||
        ticket.fullPath.includes("\0") || ticket.fullPath.length > 32_768 || !record(ticket.lease) ||
        !hex(ticket.lease.leaseId, 32) || !job(ticket.lease.job) || !source(ticket.lease.source) ||
        !safe(ticket.lease.expiresUnixMilliseconds)) throw invalid();
      const claimedJob = ticket.lease.job;
      if (specification && (!specification.extractors.some((item) => item.kind === claimedJob.kind && item.extractorVersion === claimedJob.extractorVersion) ||
        (specification.volumeId && claimedJob.identity.volumeId !== specification.volumeId))) throw invalid();
    } else if (response.ticket !== null) throw invalid();
    return response as unknown as CoreMetadataClaim;
  }
  async consumeChanges(specifications: readonly CoreMetadataChangeSpecification[], signal?: AbortSignal): Promise<CoreMetadataChangeStep> {
    if (specifications.length < 1 || specifications.length > 16 ||
      specifications.some(item => !item || ![0, 1, 2, 3, 4, 5, 6, 7, 8].includes(item.kind) || !Number.isSafeInteger(item.extractorVersion) ||
        item.extractorVersion < 1 || !Array.isArray(item.extensions) || item.extensions.length < 1 || item.extensions.length > 64 ||
        item.extensions.some(extension => typeof extension !== "string" || !/^\.[a-z0-9]{1,15}$/i.test(extension))) ||
      new Set(specifications.map(item => item.kind)).size !== specifications.length) throw new Error("core-metadata-invalid-change-specification");
    const copied = specifications.map(item => ({ ...item, extensions: [...item.extensions] }));
    const response = await this.request<unknown>("metadata.consumeChanges", { specifications: copied, pageSize: 128 }, 30_000, signal);
    if (!record(response) || !safe(response.jobsDiscovered) || Number(response.jobsDiscovered) > 128 ||
      typeof response.acknowledged !== "boolean" || typeof response.hasMore !== "boolean") throw invalid();
    return response as unknown as CoreMetadataChangeStep;
  }
  async renew(leaseId: string): Promise<boolean> {
    const response = await this.request<unknown>("metadata.renew", { leaseId });
    if (!record(response) || typeof response.renewed !== "boolean") throw invalid();
    return response.renewed;
  }
  async execute(leaseId: string, signal?: AbortSignal): Promise<CoreMetadataExecution> {
    if (!hex(leaseId, 32)) throw new Error("core-metadata-invalid-lease");
    const response = await this.request<unknown>("metadata.execute", { leaseId }, 20_000, signal);
    if (!record(response) || ![0, 1, 2, 3, 4].includes(Number(response.completion)) || typeof response.completion !== "number"
      || ![null, "indexed", "unsupported", "failed"].includes(response.state as CoreMetadataExecution["state"])
      || ([0, 4].includes(response.completion) && response.state === null)) throw invalid();
    return response as unknown as CoreMetadataExecution;
  }
  async complete(leaseId: string, result: MetadataWorkerResult, signal?: AbortSignal): Promise<0 | 1 | 2 | 3 | 4> {
    const observation = result.state === "indexed"
      ? { state: 0, width: result.width ?? null, height: result.height ?? null, durationMilliseconds: result.durationMilliseconds ?? null, errorCode: null,
        ...(result.channelCount === undefined ? {} : { channelCount: result.channelCount }),
        ...(result.textDataProperties === undefined ? {} : { textDataProperties: result.textDataProperties }),
        ...(result.archiveProperties === undefined ? {} : { archiveProperties: result.archiveProperties }),
        ...(result.threeDProperties === undefined ? {} : { threeDProperties: result.threeDProperties }),
        ...(result.documentProperties === undefined ? {} : { documentProperties: result.documentProperties }),
        ...(result.modelProperties === undefined ? {} : { modelProperties: result.modelProperties }),
        ...(result.fontProperties === undefined ? {} : { fontProperties: result.fontProperties }),
        ...(result.isAnimated === undefined ? {} : { isAnimated: result.isAnimated }),
        ...(result.visualProperties === undefined ? {} : { visualProperties: result.visualProperties }) }
      : { state: result.state === "unsupported" ? 2 : 3, width: null, height: null, durationMilliseconds: null, errorCode: result.errorCode };
    // Source version comes from the owned lease on the Host, never from this result.
    const response = await this.request<unknown>("metadata.complete", { leaseId, result: observation }, 5000, signal);
    if (!record(response) || typeof response.completion !== "number" || ![0, 1, 2, 3, 4].includes(response.completion)) throw invalid();
    return response.completion as 0 | 1 | 2 | 3 | 4;
  }
  task(ticket: CoreMetadataTicket): MetadataWorkerTask {
    return { kind: ticket.lease.job.kind === 0 ? "image-dimensions" : ticket.lease.job.kind === 1 ? "video"
      : ticket.lease.job.kind === 2 ? "audio" : ticket.lease.job.kind === 3 ? "font" : ticket.lease.job.kind === 4 ? "model" : ticket.lease.job.kind === 5 ? "document" : ticket.lease.job.kind === 6 ? "three-d" : ticket.lease.job.kind === 7 ? "text-data" : "archive", filePath: ticket.fullPath };
  }
  private async request<T>(operation: string, body: Record<string, unknown>, deadline = 5000, signal?: AbortSignal): Promise<T> {
    return requestCore(this.client, operation, body, deadline, signal);
  }
  private validateStatus(response: unknown): CoreMetadataStatus {
    if (!record(response) || !["inactive", "active", "paused"].includes(String(response.state))) throw invalid();
    if (response.ledger !== null) {
      const ledger = response.ledger;
      if (!record(ledger) || ![ledger.policyEpoch, ledger.pendingJobs, ledger.leasedJobs, ledger.completedJobs].every(safe) ||
        (ledger.nextLeaseExpiryUnixMilliseconds !== null && !safe(ledger.nextLeaseExpiryUnixMilliseconds))) throw invalid();
      if (ledger.unavailableVolumeIds !== undefined && (!Array.isArray(ledger.unavailableVolumeIds) ||
        !ledger.unavailableVolumeIds.every((volume) => hex(volume, 32)))) throw invalid();
    }
    return response as unknown as CoreMetadataStatus;
  }
}
