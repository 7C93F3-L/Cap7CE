import type { TextPreviewReply } from "../../src/shared/textPreviewTypes";
import { maximumSkimTextPreviewBytes } from "../textPreviewPolicy";
export const validTextPreviewReply = (value: unknown): value is TextPreviewReply => {
  if (!value || typeof value !== "object") return false;
  const reply = value as TextPreviewReply;
  if (reply.ok === true) return !!reply.value && typeof reply.value.content === "string" && reply.value.content.length <= maximumSkimTextPreviewBytes
    && ["utf-8", "utf-16le", "utf-16be"].includes(reply.value.encoding) && typeof reply.value.truncated === "boolean";
  return reply.ok === false && !!reply.error && typeof reply.error.code === "string" && reply.error.code.length <= 64 && typeof reply.error.message === "string" && reply.error.message.length <= 1024;
};
