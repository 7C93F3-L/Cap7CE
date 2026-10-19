export interface CoreVolumeStatus {
  volumeId: string;
  displayName: string;
  fileSystem: string;
  selected: boolean;
  state: string;
  processed: number;
  total: number | null;
  queryable: boolean;
  needsRebuild: boolean;
}

export interface CoreCatalogTaskStatus {
  taskId: string;
  kind: string;
  state: string;
  errorCode: string | null;
}

export interface CoreCatalogStatus {
  volumes: CoreVolumeStatus[];
  tasks: CoreCatalogTaskStatus[];
  catalogRevision: number;
  preparation?: import("../../src/shared/catalogPreparationTypes").CatalogPreparationProgress;
}

export interface CoreVolumeList {
  volumes: CoreVolumeStatus[];
}

export interface CoreResolvedScope {
  resolved: boolean;
  volumeId: string | null;
  rootFileReference: string | null;
  directoryFileReference?: string | null;
  displayName: string | null;
  state: string | null;
  queryable: boolean;
}

export interface CoreSearchItem {
  id: string;
  name: string;
  relativePath: string;
  extension: string;
  isDirectory: boolean;
  volumeId: string | null;
  fileReference: string | null;
  sizeBytes: number | null;
  createdUtcTicks: number | null;
  createdFileTimeMilliseconds?: string | null;
  modifiedUtcTicks: number | null;
  attributes: number | null;
}

export interface CoreSearchPage {
  items: CoreSearchItem[];
  nextCursor: string | null;
  isComplete: boolean;
  catalogRevision: number;
}
