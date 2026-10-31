export const AUDIO_FACT_EXTRACTOR_VERSION = 1;

export const supportedAudioFactExtensions = [
  ".aac", ".aif", ".aiff", ".ape", ".flac", ".m4a", ".mp3", ".ogg", ".opus", ".wav", ".wma"
] as const;

export interface AudioFactCandidate { filePath: string; sourceRevision: string }
export interface AudioFactResult {
  sourceRevision: string;
  extractorVersion: number;
  status: "indexed" | "failed";
  durationMs: number;
  channelCount: number;
  errorCode: string;
}
export interface AudioFactWriteRecord { filePath: string; result: AudioFactResult }
