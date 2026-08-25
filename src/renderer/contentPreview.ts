import type { FilePreviewKind, SkimTextPreview } from "../shared/types";

export const resolveFileContentPreview = async (filePath: string, previewKind: FilePreviewKind): Promise<{
  provider: "fileInfo" | "text" | "audio" | "video" | "pdf" | "office" | "archive" | "font" | "epub" | "mobi";
  previewUrl: string;
  textPreview?: SkimTextPreview;
}> => {
  if (previewKind === "text") {
    try {
      const textPreview = await window.cap7ce?.skim.readTextPreview(filePath);
      if (textPreview) return { provider: "text", previewUrl: "", textPreview };
    } catch {
      return { provider: "fileInfo", previewUrl: "" };
    }
  }
  if (previewKind === "audio" || previewKind === "video") {
    return {
      provider: previewKind,
      previewUrl: `cap7ce://skim-media/?path=${encodeURIComponent(filePath)}`
    };
  }
  if (previewKind === "pdf") return { provider: "pdf", previewUrl: "" };
  if (previewKind === "office") return { provider: "office", previewUrl: "" };
  if (previewKind === "archive") return { provider: "archive", previewUrl: "" };
  if (previewKind === "font") return { provider: "font", previewUrl: "" };
  if (previewKind === "epub") return { provider: "epub", previewUrl: "" };
  if (previewKind === "mobi") return { provider: "mobi", previewUrl: "" };
  return { provider: "fileInfo", previewUrl: "" };
};
