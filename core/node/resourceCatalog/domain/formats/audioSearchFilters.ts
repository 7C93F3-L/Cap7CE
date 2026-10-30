export const searchAudioDurationPresets = ["under-5s", "5s-30s", "30s-5m", "over-5m"] as const;
export type SearchAudioDurationPreset = typeof searchAudioDurationPresets[number];

export const searchAudioChannels = ["mono", "stereo", "multichannel"] as const;
export type SearchAudioChannel = typeof searchAudioChannels[number];

export interface SearchAudioDurationRange { minSeconds?: number; maxSeconds?: number }

export const normalizeAudioDurationRange = (value: unknown): SearchAudioDurationRange | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const minSeconds = candidate.minSeconds === undefined ? undefined : Number(candidate.minSeconds);
  const maxSeconds = candidate.maxSeconds === undefined ? undefined : Number(candidate.maxSeconds);
  if (minSeconds !== undefined && (!Number.isFinite(minSeconds) || minSeconds < 0 || minSeconds > 604_800)) return null;
  if (maxSeconds !== undefined && (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > 604_800)) return null;
  if (minSeconds === undefined && maxSeconds === undefined) return null;
  if (minSeconds !== undefined && maxSeconds !== undefined && minSeconds > maxSeconds) return null;
  return { ...(minSeconds === undefined ? {} : { minSeconds }), ...(maxSeconds === undefined ? {} : { maxSeconds }) };
};

export const hasAudioSearchFacets = (search: {
  audioDurationPreset?: unknown;
  audioDurationRange?: unknown;
  audioChannels?: readonly unknown[];
}) => Boolean(search.audioDurationPreset || search.audioDurationRange || search.audioChannels?.length);
