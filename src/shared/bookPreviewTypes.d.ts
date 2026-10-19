export interface BookPreviewChapter { title: string; text: string; }
export interface BookPreviewData {
  title: string; creator: string; chapters: BookPreviewChapter[];
  navigationCount: number; skippedChapterCount: number; truncated: boolean; coverDataUrl: string | null;
}
