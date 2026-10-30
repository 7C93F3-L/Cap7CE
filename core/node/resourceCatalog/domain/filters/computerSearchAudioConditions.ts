import type { SearchState } from "../../../../../src/shared/types";
import type { ComputerSearchConditions, ComputerSearchFacts, ComputerSearchIntegerRange } from "../../../../../src/shared/computerSearchFactTypes";
import { normalizeAudioDurationRange, searchAudioChannels } from "../formats/audioSearchFilters";
import { toComputerSearchImageConditions } from "./computerSearchImageConditions";
import { toComputerSearchMilliseconds } from "./computerSearchScalarConditions";

const channels: Record<string, ComputerSearchIntegerRange> = {
  mono: { minimum: 1, maximum: 1 }, stereo: { minimum: 2, maximum: 2 }, multichannel: { minimum: 3 }
};
export const toComputerSearchAudioConditions = (search: SearchState, referenceNow = new Date()): ComputerSearchConditions => {
  const result = toComputerSearchImageConditions(search, referenceNow);
  if (!search.audioDurationPreset && !search.audioDurationRange && !search.audioChannels?.length) return result;
  if (result.facts) throw new Error("computer-search-mixed-media-conditions");
  const facts: ComputerSearchFacts = { kind: "audio" };
  const duration = normalizeAudioDurationRange(search.audioDurationRange);
  if (search.audioDurationRange && !duration) throw new Error("computer-search-invalid-audio-duration");
  if (duration) {
    if (duration.minSeconds !== undefined) facts.minimumDurationMilliseconds = toComputerSearchMilliseconds(duration.minSeconds, true);
    if (duration.maxSeconds !== undefined) facts.maximumDurationMilliseconds = toComputerSearchMilliseconds(duration.maxSeconds, false);
    if (facts.minimumDurationMilliseconds !== undefined && facts.maximumDurationMilliseconds !== undefined
      && facts.minimumDurationMilliseconds > facts.maximumDurationMilliseconds)
      return { fileConditions: { ...result.fileConditions, extensions: [] } };
  } else if (search.audioDurationPreset) {
    const preset = search.audioDurationPreset;
    if (preset === "under-5s") facts.maximumDurationMilliseconds = 4999;
    else if (preset === "5s-30s") { facts.minimumDurationMilliseconds = 5000; facts.maximumDurationMilliseconds = 29999; }
    else if (preset === "30s-5m") { facts.minimumDurationMilliseconds = 30000; facts.maximumDurationMilliseconds = 299999; }
    else if (preset === "over-5m") facts.minimumDurationMilliseconds = 300000;
    else throw new Error("computer-search-invalid-audio-duration");
  }
  if (search.audioChannels?.length) {
    if (search.audioChannels.some(channel => !searchAudioChannels.includes(channel))) throw new Error("computer-search-invalid-audio-channels");
    facts.channelRanges = [...new Set(search.audioChannels)].map(channel => ({ ...channels[channel] }));
  }
  return { ...result, facts };
};
