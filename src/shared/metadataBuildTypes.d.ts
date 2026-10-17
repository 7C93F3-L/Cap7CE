export type MetadataBuildPhase = "idle" | "preparing" | "discovering" | "extracting" | "waiting" | "pausing" | "paused" | "completed" | "failed";
export interface MetadataBuildProgress {
  phase: MetadataBuildPhase;
  volumeId: string | null;
  discovered: number;
  processed: number;
  failed: number;
  unsupported: number;
  total: number | null;
  progressFraction: number | null;
  remainingSeconds: number | null;
  errorCode: string | null;
}
export interface MetadataBuildPolicy {
  volumeOrder: string[];
  includes: { volumeId: string; rootFileReference: string | null }[];
  excludes: { volumeId: string; rootFileReference: string | null }[];
}
export interface MetadataBuildStatus {
  progress: MetadataBuildProgress;
  volumes: { volumeId: string; label: string }[];
  policy: MetadataBuildPolicy | null;
  scopeLabels: Record<string, string>;
  directoryTask?: { path: string; pending: number };
}
export interface MetadataBuildApi {
  resolveScope(path: string): Promise<{ volumeId: string; rootFileReference: string | null; label: string }>;
  status(): Promise<MetadataBuildStatus>;
  start(request: { allowMetadataExtraction: boolean; policy: MetadataBuildPolicy }): Promise<MetadataBuildStatus>;
  pause(): Promise<MetadataBuildStatus>;
  resume(): Promise<MetadataBuildStatus>;
  startDirectory(request: { path: string; allowMetadataExtraction: boolean }): Promise<MetadataBuildStatus>;
  cancelDirectories(): Promise<MetadataBuildStatus>;
}
