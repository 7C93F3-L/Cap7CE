import type { LlamaRuntimeConnection } from "./llamaRuntimeManager";
import { t } from "./localization";

export type AiSearchVisualScore = 0 | 1 | 2;
export type AiSearchSingleImageErrorCode = "cancelled" | "timeout" | "connection" | "invalid_response";

export class AiSearchSingleImageError extends Error {
  constructor(public readonly code: AiSearchSingleImageErrorCode, message: string) {
    super(message);
    this.name = "AiSearchSingleImageError";
  }
}

const responseGrammar = 'root ::= "0" | "1" | "2"';

const getResponseContent = (body: unknown) => {
  const content = (body as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new AiSearchSingleImageError("invalid_response", t("search.aiVisionEmptyResponse"));
  }
  return content;
};

export const parseAiSearchVisualScore = (content: string): AiSearchVisualScore => {
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!/^[012]$/.test(cleaned)) {
    throw new AiSearchSingleImageError("invalid_response", t("search.aiVisionInvalidScore"));
  }
  return Number(cleaned) as AiSearchVisualScore;
};

export const requestAiSearchSingleImageScore = async (
  connection: LlamaRuntimeConnection,
  dataUrl: string,
  term: string,
  signal: AbortSignal,
  timeoutMs = 30_000
): Promise<AiSearchVisualScore> => {
  if (signal.aborted) throw new AiSearchSingleImageError("cancelled", t("search.aiVisionCancelled"));
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const prompt = [
    "你是严格的单张图片筛选器，只判断一个条件，不要猜测。",
    `目标：画面中清楚可见“${term}”。`,
    "如果条件包含物体和属性，所有属性必须属于同一个目标。",
    "2=明确满足完整条件；1=目标可能存在，但因太小、遮挡或角度无法确认；0=明确不满足或只是相关、相似、文字及背景。",
    "只返回0、1或2。"
  ].join("\n");

  try {
    const response = await fetch(`${connection.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: connection.modelName,
        stream: false,
        temperature: 0,
        max_tokens: 4,
        reasoning_format: "none",
        chat_template_kwargs: { enable_thinking: false },
        grammar: responseGrammar,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            { type: "text", text: prompt }
          ]
        }]
      })
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new AiSearchSingleImageError(
        "connection",
        t("search.aiVisionRequestFailed", { status: response.status, detail: responseText.slice(0, 400) })
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(responseText);
    } catch {
      throw new AiSearchSingleImageError("invalid_response", t("search.aiVisionInvalidResponse"));
    }
    return parseAiSearchVisualScore(getResponseContent(body));
  } catch (error) {
    if (error instanceof AiSearchSingleImageError) throw error;
    if (controller.signal.aborted) {
      throw new AiSearchSingleImageError(
        timedOut ? "timeout" : "cancelled",
        t(timedOut ? "search.aiVisionTimeout" : "search.aiVisionCancelled")
      );
    }
    throw new AiSearchSingleImageError("connection", error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
};
