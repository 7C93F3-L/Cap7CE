export interface SkimTextPreview {
  content: string;
  encoding: "utf-8" | "utf-16le" | "utf-16be";
  truncated: boolean;
}
export type TextPreviewReply = { ok: true; value: SkimTextPreview } | { ok: false; error: { code: string; message: string } };
