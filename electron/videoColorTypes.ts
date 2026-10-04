import type { VisualPropertyIndexRecord } from "./visualPropertyTypes";

export const VIDEO_COLOR_REPRESENTATIVE_VERSION = 1;

export interface VideoColorCandidate {
  filePath: string;
  sourceRevision: string;
}

export interface VideoColorWriteRecord {
  filePath: string;
  record: VisualPropertyIndexRecord;
}
