import type { FontPreviewData } from "../../src/shared/fontPreviewTypes";
import type { EpubPreviewData } from "../../src/shared/epubPreviewTypes";
import type { ArchivePreviewData } from "../../src/shared/archivePreviewTypes";
import type { PdfPreviewMetadata } from "../../src/shared/pdfPreviewTypes";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 4 * 1024 * 1024) => typeof value === "string" && value.length <= max;
const natural = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
export const validFontPreview = (value: unknown): value is FontPreviewData => object(value) && text(value.familyName, 4096) && text(value.styleName, 4096)
  && natural(value.weight) && natural(value.glyphCount) && typeof value.supportsLatinSample === "boolean" && typeof value.supportsChineseSample === "boolean"
  && Array.isArray(value.variationAxes) && value.variationAxes.length <= 64 && value.variationAxes.every(axis => object(axis) && text(axis.tag, 4) && [axis.minimum, axis.defaultValue, axis.maximum].every(Number.isFinite));
export const validBookPreview = (value: unknown): value is EpubPreviewData => object(value) && text(value.title) && text(value.creator) && natural(value.navigationCount) && natural(value.skippedChapterCount)
  && typeof value.truncated === "boolean" && (value.coverDataUrl === null || text(value.coverDataUrl, 8 * 1024 * 1024) && String(value.coverDataUrl).startsWith("data:image/png;base64,"))
  && Array.isArray(value.chapters) && value.chapters.length <= 2000 && value.chapters.every(chapter => object(chapter) && text(chapter.title) && text(chapter.text));
export const validArchivePreview = (value: unknown): value is ArchivePreviewData => object(value) && natural(value.entryCount) && typeof value.totalUncompressedSize === "number" && Number.isFinite(value.totalUncompressedSize)
  && typeof value.truncated === "boolean" && Array.isArray(value.entries) && value.entries.length <= 2000 && value.entries.every(entry => object(entry) && text(entry.path, 4096) && (entry.size === null || natural(entry.size)) && (entry.compressedSize === null || natural(entry.compressedSize)) && typeof entry.directory === "boolean");
export const validPdfPreview = (value: unknown): value is PdfPreviewMetadata => object(value) && natural(value.pageCount) && Number(value.pageCount) > 0 && natural(value.defaultPageWidth) && Number(value.defaultPageWidth) > 0 && natural(value.defaultPageHeight) && Number(value.defaultPageHeight) > 0;
