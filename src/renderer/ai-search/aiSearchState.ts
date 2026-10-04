import type { ImageIndexItem, SearchState } from "../../shared/types";

const filePathKey = (filePath: string) => filePath.toLocaleLowerCase();
const stringListKey = (values: string[] | undefined) => [...(values ?? [])].sort().join("\u0000");
const valueKey = (value: unknown) => JSON.stringify(value ?? null);

export const mergeAiSearchResults = (baseResults: ImageIndexItem[], preservedMatches: ImageIndexItem[]) => {
  const knownPaths = new Set(baseResults.map((item) => filePathKey(item.filePath)));
  const additions = preservedMatches.filter((item) => !knownPaths.has(filePathKey(item.filePath)));
  return additions.length > 0 ? [...baseResults, ...additions] : baseResults;
};

export const hasAiSearchScopeChanged = (previous: SearchState, next: SearchState) => (
  next.query !== previous.query
  || next.directoryId !== previous.directoryId
  || next.fileFormat !== previous.fileFormat
  || stringListKey(next.selectedExtensions) !== stringListKey(previous.selectedExtensions)
  || next.timePreset !== previous.timePreset
  || next.modifiedTimeRange?.startMs !== previous.modifiedTimeRange?.startMs
  || next.modifiedTimeRange?.endMs !== previous.modifiedTimeRange?.endMs
  || next.fileSizePreset !== previous.fileSizePreset
  || valueKey(next.fileSizeRange) !== valueKey(previous.fileSizeRange)
  || stringListKey(next.visualColors) !== stringListKey(previous.visualColors)
  || stringListKey(next.imageColorTraits) !== stringListKey(previous.imageColorTraits)
  || stringListKey(next.imageAspectRatios) !== stringListKey(previous.imageAspectRatios)
  || valueKey(next.imageAspectRatioValues) !== valueKey(previous.imageAspectRatioValues)
  || valueKey(next.imageDimensionFilter) !== valueKey(previous.imageDimensionFilter)
  || next.imageAnimation !== previous.imageAnimation
  || next.videoDurationPreset !== previous.videoDurationPreset
  || valueKey(next.videoDurationRange) !== valueKey(previous.videoDurationRange)
  || stringListKey(next.videoAspectRatios) !== stringListKey(previous.videoAspectRatios)
  || valueKey(next.videoAspectRatioValues) !== valueKey(previous.videoAspectRatioValues)
  || stringListKey(next.videoResolutions) !== stringListKey(previous.videoResolutions)
  || valueKey(next.videoDimensionFilter) !== valueKey(previous.videoDimensionFilter)
  || stringListKey(next.videoVisualColors) !== stringListKey(previous.videoVisualColors)
  || stringListKey(next.videoColorTraits) !== stringListKey(previous.videoColorTraits)
  || next.audioDurationPreset !== previous.audioDurationPreset
  || valueKey(next.audioDurationRange) !== valueKey(previous.audioDurationRange)
  || stringListKey(next.audioChannels) !== stringListKey(previous.audioChannels)
  || next.documentContentCountPreset !== previous.documentContentCountPreset
  || valueKey(next.documentContentCountRange) !== valueKey(previous.documentContentCountRange)
  || next.documentImageComposition !== previous.documentImageComposition
  || next.artboardCountPreset !== previous.artboardCountPreset
  || valueKey(next.artboardCountRange) !== valueKey(previous.artboardCountRange)
  || next.textCharacterCountPreset !== previous.textCharacterCountPreset
  || valueKey(next.textCharacterCountRange) !== valueKey(previous.textCharacterCountRange)
  || next.textLineCountPreset !== previous.textLineCountPreset
  || valueKey(next.textLineCountRange) !== valueKey(previous.textLineCountRange)
  || next.csvRecordCountPreset !== previous.csvRecordCountPreset
  || valueKey(next.csvRecordCountRange) !== valueKey(previous.csvRecordCountRange)
  || next.csvColumnCountPreset !== previous.csvColumnCountPreset
  || valueKey(next.csvColumnCountRange) !== valueKey(previous.csvColumnCountRange)
  || next.jsonItemCountPreset !== previous.jsonItemCountPreset
  || valueKey(next.jsonItemCountRange) !== valueKey(previous.jsonItemCountRange)
  || next.jsonRootKind !== previous.jsonRootKind
  || stringListKey(next.threeDModelTypes) !== stringListKey(previous.threeDModelTypes)
  || stringListKey(next.threeDStructures) !== stringListKey(previous.threeDStructures)
  || next.threeDTriangleCountPreset !== previous.threeDTriangleCountPreset
  || valueKey(next.threeDTriangleCountRange) !== valueKey(previous.threeDTriangleCountRange)
  || stringListKey(next.archiveContentTypes) !== stringListKey(previous.archiveContentTypes)
  || next.archiveEntryCountPreset !== previous.archiveEntryCountPreset
  || valueKey(next.archiveEntryCountRange) !== valueKey(previous.archiveEntryCountRange)
  || stringListKey(next.archiveStructures) !== stringListKey(previous.archiveStructures)
  || stringListKey(next.fontWeights) !== stringListKey(previous.fontWeights)
  || stringListKey(next.fontStyles) !== stringListKey(previous.fontStyles)
  || stringListKey(next.fontCharacterSets) !== stringListKey(previous.fontCharacterSets)
  || stringListKey(next.fontKinds) !== stringListKey(previous.fontKinds)
);
