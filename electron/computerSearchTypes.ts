import type { FilePreviewKind } from "./formatCapabilities";
import type { ComputerSearchFacts, ComputerSearchFileConditions } from "../src/shared/computerSearchFactTypes";

export type ComputerSearchState =
  | "not-enabled" | "starting" | "building" | "syncing" | "ready"
  | "offline" | "needs-rebuild" | "repair-required" | "unavailable";

export interface ComputerSearchVolumeStatus {
  volumeId: string;
  displayName: string;
  state: string;
  processed: number;
  total: number | null;
  queryable: boolean;
}

export interface ComputerSearchStatus {
  state: ComputerSearchState;
  reason?: string;
  searchAvailable: boolean;
  catalogRevision: number;
  volumes: ComputerSearchVolumeStatus[];
}

export interface ComputerSearchCapabilityVolume {
  driveLetter: string;
  label: string;
  sizeBytes: number | null;
  freeBytes: number | null;
}

export interface ComputerSearchRuntimeInstallState {
  phase: "idle" | "downloading" | "verifying" | "installing" | "ready" | "restart-required" | "failed";
  receivedBytes: number;
  totalBytes: number | null;
}

export interface ComputerSearchCapabilityOptions {
  bundleAvailable: boolean;
  runtimeReady: boolean;
  busy: boolean;
  volumes: ComputerSearchCapabilityVolume[];
  runtimeInstall: ComputerSearchRuntimeInstallState;
}

export interface ComputerSearchCapabilityRequest {
  action: "enable" | "repair" | "remove";
  volumeLetters: string[];
  removeCatalog: boolean;
}

export interface ComputerSearchCapabilityResult {
  status: "completed" | "busy" | "unavailable" | "restart-required" | "runtime-required" | "failed";
  reason: string;
}

export interface ComputerSearchRequest {
  taskId: string;
  query: string;
  scopePath: string | null;
  scopeKind?: "direct-children";
  facts?: ComputerSearchFacts;
  fileConditions?: ComputerSearchFileConditions;
}

export interface ComputerSearchNextPageRequest { taskId: string; cursor: string }

export interface ComputerSearchItem {
  id: string;
  authorizationId: string;
  name: string;
  path: string;
  relativePath: string;
  extension: string;
  isDirectory: boolean;
  volumeId: string;
  fileReference: string;
  sizeBytes: number | null;
  createdUtcTicks: number | null;
  modifiedUtcTicks: number | null;
  attributes: number | null;
  iconName: string;
  previewKind: FilePreviewKind;
  canThumbnail: boolean;
  canShellPreview: boolean;
  canDirectPreview: boolean;
}

export interface ComputerSearchAuthorization {
  taskId: string;
  authorizationId: string;
}

export interface ComputerSearchAuthorizationBatch {
  taskId: string;
  authorizationIds: string[];
}

export interface ComputerSearchPage {
  taskId: string;
  items: ComputerSearchItem[];
  nextCursor: string | null;
  isComplete: boolean;
  catalogRevision: number;
}
