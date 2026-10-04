import type { IpcMainInvokeEvent } from "electron";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import type { RuntimeDiagnostics } from "./runtimeDiagnostics";

interface SearchTaskState {
  cancelled: boolean;
}

interface SearchRequestShape {
  query?: unknown;
  directoryId?: unknown;
  fileFormat?: unknown;
  sortField?: unknown;
  sortDirection?: unknown;
  includedExtensions?: unknown;
  selectedExtensions?: unknown;
  timePreset?: unknown;
  fileSizePreset?: unknown;
  fileSizeRange?: unknown;
  visualColors?: unknown;
  imageColorTraits?: unknown;
  imageAspectRatios?: unknown;
  imageAspectRatioValues?: unknown;
  imageDimensionFilter?: unknown;
  imageAnimation?: unknown;
  videoDurationPreset?: unknown;
  videoDurationRange?: unknown;
  videoAspectRatios?: unknown;
  videoAspectRatioValues?: unknown;
  videoResolutions?: unknown;
  videoDimensionFilter?: unknown;
  videoVisualColors?: unknown;
  videoColorTraits?: unknown;
  audioDurationPreset?: unknown;
  audioDurationRange?: unknown;
  audioChannels?: unknown;
  documentContentCountPreset?: unknown;
  documentContentCountRange?: unknown;
  documentImageComposition?: unknown;
  artboardCountPreset?: unknown;
  artboardCountRange?: unknown;
  textCharacterCountPreset?: unknown;
  textCharacterCountRange?: unknown;
  textLineCountPreset?: unknown;
  textLineCountRange?: unknown;
  csvRecordCountPreset?: unknown;
  csvRecordCountRange?: unknown;
  csvColumnCountPreset?: unknown;
  csvColumnCountRange?: unknown;
  jsonItemCountPreset?: unknown;
  jsonItemCountRange?: unknown;
  jsonRootKind?: unknown;
  threeDModelTypes?: unknown;
  threeDStructures?: unknown;
  threeDTriangleCountPreset?: unknown;
  threeDTriangleCountRange?: unknown;
}

const summarizeSearch = (search: unknown) => {
  const request = search && typeof search === "object" ? search as SearchRequestShape : {};
  const query = typeof request.query === "string" ? request.query : "";
  return {
    queryLength: query.length,
    queryTermCount: query.trim() ? query.trim().split(/\s+/u).length : 0,
    scope: typeof request.directoryId === "string" && request.directoryId ? "directory" : "all",
    fileFormat: typeof request.fileFormat === "string" ? request.fileFormat.slice(0, 30) : "unknown",
    sortField: request.sortField,
    sortDirection: request.sortDirection,
    includedExtensionCount: Array.isArray(request.includedExtensions) ? request.includedExtensions.length : 0,
    selectedExtensionCount: Array.isArray(request.selectedExtensions) ? request.selectedExtensions.length : 0,
    timePreset: typeof request.timePreset === "string" ? request.timePreset.slice(0, 20) : "all",
    fileSize: typeof request.fileSizePreset === "string" || typeof request.fileSizeRange === "object",
    visualColorCount: Array.isArray(request.visualColors) ? request.visualColors.length : 0,
    imageColorTraitCount: Array.isArray(request.imageColorTraits) ? request.imageColorTraits.length : 0,
    imageAspectRatioCount: (Array.isArray(request.imageAspectRatios) ? request.imageAspectRatios.length : 0)
      + (Array.isArray(request.imageAspectRatioValues) ? request.imageAspectRatioValues.length : 0),
    imageDimensionFiltered: typeof request.imageDimensionFilter === "object" && request.imageDimensionFilter !== null,
    imageAnimation: typeof request.imageAnimation === "string" ? request.imageAnimation.slice(0, 12) : "all",
    videoDuration: typeof request.videoDurationPreset === "string" || typeof request.videoDurationRange === "object",
    videoAspectRatioCount: (Array.isArray(request.videoAspectRatios) ? request.videoAspectRatios.length : 0)
      + (Array.isArray(request.videoAspectRatioValues) ? request.videoAspectRatioValues.length : 0),
    videoResolutionCount: Array.isArray(request.videoResolutions) ? request.videoResolutions.length : 0,
    videoDimensionFiltered: typeof request.videoDimensionFilter === "object" && request.videoDimensionFilter !== null,
    videoVisualColorCount: Array.isArray(request.videoVisualColors) ? request.videoVisualColors.length : 0,
    videoColorTraitCount: Array.isArray(request.videoColorTraits) ? request.videoColorTraits.length : 0,
    audioDuration: typeof request.audioDurationPreset === "string" || typeof request.audioDurationRange === "object",
    audioChannelCount: Array.isArray(request.audioChannels) ? request.audioChannels.length : 0,
    documentContentCount: typeof request.documentContentCountPreset === "string" || typeof request.documentContentCountRange === "object",
    documentImageComposition: typeof request.documentImageComposition === "string" ? request.documentImageComposition.slice(0, 24) : "all",
    artboardCount: typeof request.artboardCountPreset === "string" || typeof request.artboardCountRange === "object",
    textDataFiltered: [
      request.textCharacterCountPreset, request.textCharacterCountRange, request.textLineCountPreset, request.textLineCountRange,
      request.csvRecordCountPreset, request.csvRecordCountRange, request.csvColumnCountPreset, request.csvColumnCountRange,
      request.jsonItemCountPreset, request.jsonItemCountRange, request.jsonRootKind
    ].some((value) => value !== undefined),
    threeDModelTypeCount: Array.isArray(request.threeDModelTypes) ? request.threeDModelTypes.length : 0,
    threeDStructureCount: Array.isArray(request.threeDStructures) ? request.threeDStructures.length : 0,
    threeDTriangleCount: typeof request.threeDTriangleCountPreset === "string" || typeof request.threeDTriangleCountRange === "object"
  };
};

const summarizeResults = (result: unknown) => {
  const images = result && typeof result === "object" && Array.isArray((result as { images?: unknown }).images)
    ? (result as { images: unknown[] }).images
    : [];
  const countBy = (key: "extension" | "previewKind" | "failureType") => {
    const counts = new Map<string, number>();
    for (const item of images) {
      const value = item && typeof item === "object" && typeof (item as Record<string, unknown>)[key] === "string"
        ? String((item as Record<string, unknown>)[key]).slice(0, 30)
        : "unknown";
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return Object.fromEntries([...counts].sort((left, right) => right[1] - left[1]).slice(0, 30));
  };
  return {
    resultCount: images.length,
    extensions: countBy("extension"),
    previewKinds: countBy("previewKind"),
    failureTypes: countBy("failureType")
  };
};

export interface RegisterSearchIpcOptions<TSearch, TDirectory, TResult> {
  registrar: IpcRegistrar;
  isSenderAllowed: (event: IpcMainInvokeEvent) => boolean;
  translateSearchFailed: () => string;
  listDirectories: () => Promise<TDirectory[]>;
  search: (
    request: TSearch,
    directories: TDirectory[],
    options: { isCancelled: () => boolean }
  ) => Promise<TResult>;
  refresh: (directoryIds?: string[]) => void;
  diagnostics: RuntimeDiagnostics;
}

export interface SearchIpcController {
  cancelAll(): void;
}

export const registerSearchIpc = <TSearch, TDirectory, TResult>({
  registrar,
  isSenderAllowed,
  translateSearchFailed,
  listDirectories,
  search,
  refresh,
  diagnostics
}: RegisterSearchIpcOptions<TSearch, TDirectory, TResult>): SearchIpcController => {
  const tasks = new Map<string, SearchTaskState>();
  registerIpcDomain({
    registrar,
    registrations: [
      {
        kind: "handle",
        channel: "search:images",
        listener: async (event, rawSearch: unknown, taskId: unknown) => {
          if (!isSenderAllowed(event) || typeof taskId !== "string" || !taskId.trim() || taskId.length > 128) {
            throw new Error(translateSearchFailed());
          }
          const normalizedTaskId = taskId.trim();
          const task = { cancelled: false };
          tasks.set(normalizedTaskId, task);
          const operation = diagnostics.startOperation("search.query", summarizeSearch(rawSearch));
          try {
            const result = await search(rawSearch as TSearch, await listDirectories(), { isCancelled: () => task.cancelled });
            const resultRecord = result as unknown as { images?: unknown };
            const resultCount = result && typeof result === "object" && Array.isArray(resultRecord.images)
              ? resultRecord.images.length
              : undefined;
            diagnostics.logDetailed("search.query.result_detail", summarizeResults(result));
            operation.complete({ resultCount, cancelled: task.cancelled });
            return result;
          } catch (error) {
            operation.fail(error, { cancelled: task.cancelled });
            throw error;
          } finally {
            if (tasks.get(normalizedTaskId) === task) tasks.delete(normalizedTaskId);
          }
        }
      },
      {
        kind: "handle",
        channel: "search:cancel",
        listener: (event, taskId: unknown) => {
          if (!isSenderAllowed(event) || typeof taskId !== "string" || !taskId.trim() || taskId.length > 128) return false;
          const task = tasks.get(taskId.trim());
          if (!task) return false;
          task.cancelled = true;
          return true;
        }
      },
      {
        kind: "handle",
        channel: "search:refresh",
        listener: (event, directoryIds: unknown) => {
          if (!isSenderAllowed(event)) return false;
          const normalizedIds = Array.isArray(directoryIds)
            ? directoryIds.filter((id): id is string => typeof id === "string" && id.length > 0)
            : undefined;
          refresh(normalizedIds);
          return true;
        }
      }
    ]
  });
  return {
    cancelAll: () => {
      for (const task of tasks.values()) task.cancelled = true;
    }
  };
};
