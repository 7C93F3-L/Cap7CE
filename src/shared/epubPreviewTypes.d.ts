import type { BookPreviewData } from "./bookPreviewTypes";
export type { BookPreviewData as EpubPreviewData, BookPreviewChapter as EpubPreviewChapter } from "./bookPreviewTypes";
export type EpubPreviewFallbackReason = "invalidEpub" | "encrypted" | "tooLarge" | "timedOut" | "failed";
export type EpubWorkerResponse = { ok: true; data: BookPreviewData } | { ok: false; reason: EpubPreviewFallbackReason; message: string };
