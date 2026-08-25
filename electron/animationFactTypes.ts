export const ANIMATION_FACT_EXTRACTOR_VERSION = 1;
export const supportedAnimationFactExtensions = [".gif", ".webp", ".png"] as const;

export interface AnimationFactCandidate { filePath: string; sourceRevision: string }
export interface AnimationFactResult {
  sourceRevision: string;
  extractorVersion: number;
  status: "indexed" | "failed";
  isAnimated: boolean;
  errorCode: string;
}
export interface AnimationFactWriteRecord { filePath: string; result: AnimationFactResult }
