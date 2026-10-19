import type { LocalKeywordModelConnection } from "../../../src/shared/localKeywordTypes";
import { keywordGrammar, keywordPrompt, parseGeneratedKeywords } from "../../../electron/core/localKeywordPolicy";
import { requestLocalKeywordResponse } from "./requestHttp";
const invalid = () => new Error("模型未返回有效关键词，请重试。");
export async function requestModelKeywords(connection: LocalKeywordModelConnection, dataUrl: string, signal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController(); let timedOut = false;
  const cancel = () => controller.abort(); signal.addEventListener("abort", cancel, { once: true }); if (signal.aborted) cancel();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const body = await requestLocalKeywordResponse(connection,
      JSON.stringify({ model: connection.modelName, stream: false, temperature: 0.2, max_tokens: 512,
        reasoning_format: "none", chat_template_kwargs: { enable_thinking: false }, grammar: keywordGrammar,
        messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: dataUrl } }, { type: "text", text: keywordPrompt }] }] }), controller.signal);
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw invalid(); return parseGeneratedKeywords(content);
  } catch (error) {
    if (timedOut) throw Error("关键词生成超时，请重试。");
    if (signal.aborted) throw Error("cancelled"); throw error;
  } finally { clearTimeout(timer); signal.removeEventListener("abort", cancel); controller.abort(); }
}
