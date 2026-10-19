import type { MetadataBuildPolicy, MetadataBuildProgress, MetadataBuildStatus, MetadataDirectoryStorageError } from "../../src/shared/metadataBuildTypes";

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const hex = (value: unknown, length: number) => typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`, "i").test(value);
const safe = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const path = (value: unknown) => typeof value === "string" && value.length <= 32768 && /^[A-Za-z]:[\\/]/.test(value);
const invalid = (): never => { throw new Error("metadata-build-invalid-response"); };
const errorCode = (value: unknown) => typeof value === "string" && /^metadata-[a-z-]{1,100}$/.test(value);
export const validMetadataStorageError = (value: unknown): value is MetadataDirectoryStorageError => record(value)
  && ["read", "write", "replace", "validate"].includes(String(value.operation)) && typeof value.code === "string" && /^[A-Z][A-Z0-9_]{0,31}$/.test(value.code)
  && Object.keys(value).every(key => key === "operation" || key === "code");
const scope = (value: unknown) => record(value) && hex(value.volumeId, 32) && (value.rootFileReference === null || hex(value.rootFileReference, 16));
const policy = (value: unknown): value is MetadataBuildPolicy => record(value) && Array.isArray(value.volumeOrder)
  && value.volumeOrder.length > 0 && value.volumeOrder.length <= 64 && Array.from(value.volumeOrder).every(id => hex(id, 32))
  && new Set(value.volumeOrder).size === value.volumeOrder.length && Array.isArray(value.includes) && Array.isArray(value.excludes)
  && value.includes.length + value.excludes.length <= 256 && [...value.includes, ...value.excludes].every(scope);
const phases = new Set<MetadataBuildProgress["phase"]>(["idle", "preparing", "discovering", "extracting", "waiting", "pausing", "paused", "completed", "failed"]);
export function unwrapMetadataBuildReply(value: unknown): unknown {
  if (!record(value) || !Object.prototype.hasOwnProperty.call(value, "result") || !Object.prototype.hasOwnProperty.call(value, "errorCode")
    || Object.keys(value).some(key => !["result", "errorCode", "storageError"].includes(key))
    || value.storageError !== undefined && !validMetadataStorageError(value.storageError)) return invalid();
  if (value.errorCode !== null) {
    if (!errorCode(value.errorCode) || value.result !== null) return invalid();
    throw Object.assign(new Error(String(value.errorCode)), value.storageError ? { details: value.storageError } : {});
  }
  if (value.result === null || value.storageError !== undefined) return invalid();
  return value.result;
}
export function readMetadataBuildStatus(value: unknown): MetadataBuildStatus {
  if (!record(value) || !record(value.progress) || !Array.isArray(value.volumes) || value.volumes.length > 64
    || !Array.from(value.volumes).every(volume => record(volume) && hex(volume.volumeId, 32) && typeof volume.label === "string" && volume.label.length <= 32768)
    || value.policy !== null && !policy(value.policy) || !record(value.scopeLabels)
    || !Object.entries(value.scopeLabels).every(([key, label]) => /^[a-f0-9]{32}:(?:root|[a-f0-9]{16})$/i.test(key) && path(label))) return invalid();
  const p = value.progress;
  if (!phases.has(p.phase as MetadataBuildProgress["phase"]) || p.volumeId !== null && !hex(p.volumeId, 32)
    || ![p.discovered, p.processed, p.failed, p.unsupported].every(safe) || p.total !== null && !safe(p.total)
    || p.progressFraction !== null && (typeof p.progressFraction !== "number" || !Number.isFinite(p.progressFraction) || p.progressFraction < 0 || p.progressFraction > 1)
    || p.remainingSeconds !== null && (typeof p.remainingSeconds !== "number" || !Number.isFinite(p.remainingSeconds) || p.remainingSeconds < 0)
    || p.errorCode !== null && !errorCode(p.errorCode) || p.storageError !== undefined && !validMetadataStorageError(p.storageError)
    || value.directoryTask !== undefined && (!record(value.directoryTask) || !path(value.directoryTask.path) || !safe(value.directoryTask.pending) || Number(value.directoryTask.pending) > 32)) return invalid();
  return value as unknown as MetadataBuildStatus;
}
export function readMetadataBuildScope(value: unknown): { volumeId: string; rootFileReference: string | null; label: string } {
  if (!scope(value) || !record(value) || !path(value.label)) return invalid();
  return value as { volumeId: string; rootFileReference: string | null; label: string };
}
export function readMetadataBuildAck(value: unknown, key = "accepted"): void {
  if (!record(value) || Object.keys(value).length !== 1 || value[key] !== true) invalid();
}
