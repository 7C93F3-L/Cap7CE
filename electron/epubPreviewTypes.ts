export interface EpubPreviewChapter {
  title: string;
  text: string;
}

export interface EpubPreviewData {
  title: string;
  creator: string;
  chapters: EpubPreviewChapter[];
  navigationCount: number;
  skippedChapterCount: number;
  truncated: boolean;
  coverDataUrl: string | null;
}

export type EpubPreviewFallbackReason = "invalidEpub" | "encrypted" | "tooLarge" | "timedOut" | "failed";
export type EpubWorkerResponse = { ok: true; data: EpubPreviewData } | { ok: false; reason: EpubPreviewFallbackReason; message: string };
