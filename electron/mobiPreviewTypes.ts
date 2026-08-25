export interface MobiPreviewChapter {
  title: string;
  text: string;
}

export interface MobiPreviewData {
  title: string;
  creator: string;
  chapters: MobiPreviewChapter[];
  navigationCount: number;
  skippedChapterCount: number;
  truncated: boolean;
  coverDataUrl: string | null;
}

export type MobiPreviewFallbackReason =
  | "invalidMobi"
  | "encrypted"
  | "unsupportedMobi"
  | "tooLarge"
  | "timedOut"
  | "failed";

export type MobiWorkerResponse =
  | { ok: true; data: MobiPreviewData }
  | { ok: false; reason: MobiPreviewFallbackReason; message: string };
