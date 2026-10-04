import type { IpcMainInvokeEvent } from "electron";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import type { AiSearchStartRequest, AiSearchStartResponse, AiSearchUpdate } from "./aiSearchService";
import { t } from "./localization";
import { normalizeImageAspectRatioValues, normalizeImageDimensionFilter, searchImageAnimationModes, searchImageAspectRatios, searchImageColorTraits, searchVisualColors } from "./imageSearchFilters";
import { normalizeVideoAspectRatioValues, normalizeVideoDimensionFilter, normalizeVideoDurationRange, searchVideoAspectRatios, searchVideoColorTraits, searchVideoDurationPresets, searchVideoResolutions, searchVideoVisualColors } from "./videoSearchFilters";
import { normalizeAudioDurationRange, searchAudioChannels, searchAudioDurationPresets } from "./audioSearchFilters";
import { normalizeFileSizeRange, searchFileSizePresets } from "./fileSizeSearchFilters";

export interface AiSearchIpcDependencies {
  registrar: IpcRegistrar;
  isMainSenderAllowed: (event: IpcMainInvokeEvent) => boolean;
  startSearch: (
    request: AiSearchStartRequest,
    emit: (update: AiSearchUpdate) => void
  ) => Promise<AiSearchStartResponse>;
  cancelSearch: (sessionId: string, discard: boolean) => boolean;
}

const isSearchState = (value: unknown): value is AiSearchStartRequest["search"] => {
  if (!value || typeof value !== "object") return false;
  const search = value as Record<string, unknown>;
  return typeof search.query === "string"
    && typeof search.directoryId === "string"
    && typeof search.fileFormat === "string"
    && (search.sortField === "file_name" || search.sortField === "modified_at")
    && (search.sortDirection === "asc" || search.sortDirection === "desc")
    && (search.includedExtensions === undefined || (
      Array.isArray(search.includedExtensions)
      && search.includedExtensions.every((extension) => typeof extension === "string")
    ))
    && (search.selectedExtensions === undefined || (
      Array.isArray(search.selectedExtensions)
      && search.selectedExtensions.every((extension) => typeof extension === "string")
    ))
    && (search.timePreset === undefined || ["week", "month", "year", "last-year", "older", "all", "custom"].includes(String(search.timePreset)))
    && (search.modifiedTimeRange === undefined || (
      typeof search.modifiedTimeRange === "object"
      && search.modifiedTimeRange !== null
      && Number.isFinite((search.modifiedTimeRange as Record<string, unknown>).startMs)
      && Number.isFinite((search.modifiedTimeRange as Record<string, unknown>).endMs)
    ))
    && (search.fileSizePreset === undefined || searchFileSizePresets.includes(String(search.fileSizePreset) as (typeof searchFileSizePresets)[number]))
    && (search.fileSizeRange === undefined || normalizeFileSizeRange(search.fileSizeRange) !== null)
    && (search.visualColors === undefined || (Array.isArray(search.visualColors) && search.visualColors.every((color) => searchVisualColors.includes(String(color) as (typeof searchVisualColors)[number]))))
    && (search.imageColorTraits === undefined || (Array.isArray(search.imageColorTraits) && search.imageColorTraits.every((trait) => searchImageColorTraits.includes(String(trait) as (typeof searchImageColorTraits)[number]))))
    && (search.imageAspectRatios === undefined || (Array.isArray(search.imageAspectRatios) && search.imageAspectRatios.every((ratio) => searchImageAspectRatios.includes(String(ratio) as (typeof searchImageAspectRatios)[number]))))
    && (search.imageAspectRatioValues === undefined || (Array.isArray(search.imageAspectRatioValues) && normalizeImageAspectRatioValues(search.imageAspectRatioValues).length === search.imageAspectRatioValues.length))
    && (search.imageDimensionFilter === undefined || normalizeImageDimensionFilter(search.imageDimensionFilter) !== null)
    && (search.imageAnimation === undefined || searchImageAnimationModes.includes(String(search.imageAnimation) as (typeof searchImageAnimationModes)[number]))
    && (search.videoDurationPreset === undefined || searchVideoDurationPresets.includes(String(search.videoDurationPreset) as (typeof searchVideoDurationPresets)[number]))
    && (search.videoDurationRange === undefined || normalizeVideoDurationRange(search.videoDurationRange) !== null)
    && (search.videoAspectRatios === undefined || (Array.isArray(search.videoAspectRatios) && search.videoAspectRatios.every((ratio) => searchVideoAspectRatios.includes(String(ratio) as (typeof searchVideoAspectRatios)[number]))))
    && (search.videoAspectRatioValues === undefined || (Array.isArray(search.videoAspectRatioValues) && normalizeVideoAspectRatioValues(search.videoAspectRatioValues).length === search.videoAspectRatioValues.length))
    && (search.videoResolutions === undefined || (Array.isArray(search.videoResolutions) && search.videoResolutions.every((resolution) => searchVideoResolutions.includes(String(resolution) as (typeof searchVideoResolutions)[number]))))
    && (search.videoDimensionFilter === undefined || normalizeVideoDimensionFilter(search.videoDimensionFilter) !== null)
    && (search.videoVisualColors === undefined || (Array.isArray(search.videoVisualColors) && search.videoVisualColors.every((color) => searchVideoVisualColors.includes(String(color) as (typeof searchVideoVisualColors)[number]))))
    && (search.videoColorTraits === undefined || (Array.isArray(search.videoColorTraits) && search.videoColorTraits.every((trait) => searchVideoColorTraits.includes(String(trait) as (typeof searchVideoColorTraits)[number]))))
    && (search.audioDurationPreset === undefined || searchAudioDurationPresets.includes(String(search.audioDurationPreset) as (typeof searchAudioDurationPresets)[number]))
    && (search.audioDurationRange === undefined || normalizeAudioDurationRange(search.audioDurationRange) !== null)
    && (search.audioChannels === undefined || (Array.isArray(search.audioChannels) && search.audioChannels.every((channel) => searchAudioChannels.includes(String(channel) as (typeof searchAudioChannels)[number]))));
};

const parseStartRequest = (value: unknown): AiSearchStartRequest => {
  if (!value || typeof value !== "object") throw new Error(t("search.aiInvalidRequest"));
  const request = value as Record<string, unknown>;
  if (
    typeof request.sessionId !== "string"
    || request.sessionId.length < 8
    || request.sessionId.length > 128
    || !isSearchState(request.search)
    || !Array.isArray(request.excludeFilePaths)
    || !request.excludeFilePaths.every((filePath) => typeof filePath === "string")
  ) {
    throw new Error(t("search.aiInvalidRequestParameters"));
  }
  return {
    sessionId: request.sessionId,
    search: request.search,
    excludeFilePaths: request.excludeFilePaths.slice(0, 10_000)
  };
};

export const registerAiSearchIpc = ({
  registrar,
  isMainSenderAllowed,
  startSearch,
  cancelSearch
}: AiSearchIpcDependencies): void => {
  registerIpcDomain({
    registrar,
    isSenderAllowed: isMainSenderAllowed,
    registrations: [
      {
        kind: "handle",
        channel: "aiSearch:start",
        listener: (event, request: unknown) => startSearch(parseStartRequest(request), (update) => {
          if (!event.sender.isDestroyed()) event.sender.send("aiSearch:update", update);
        })
      },
      {
        kind: "handle",
        channel: "aiSearch:cancel",
        listener: (_event, sessionId: unknown, discard: unknown) => (
          typeof sessionId === "string" ? cancelSearch(sessionId, discard === true) : false
        )
      }
    ]
  });
};
