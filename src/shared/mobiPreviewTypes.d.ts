import type { BookPreviewData } from "./bookPreviewTypes";
export type { BookPreviewData as MobiPreviewData, BookPreviewChapter as MobiPreviewChapter } from "./bookPreviewTypes";
export type MobiPreviewFallbackReason =
  | "invalidMobi"
  | "encrypted"
  | "unsupportedMobi"
  | "tooLarge"
  | "timedOut"
  | "failed";

export type MobiWorkerResponse =
  | { ok: true; data: BookPreviewData }
  | { ok: false; reason: MobiPreviewFallbackReason; message: string };
