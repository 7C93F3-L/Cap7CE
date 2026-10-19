import http from "node:http";
import type { LocalKeywordModelConnection } from "../../../src/shared/localKeywordTypes";

const maximumResponseBytes = 1024 * 1024;
const invalid = () => new Error("模型未返回有效关键词，请重试。");
async function readResponse(response: http.IncomingMessage) {
  if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
    response.destroy(); throw Error(`模型请求失败（${response.statusCode ?? 0}），请检查本地模型服务后重试。`);
  }
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of response) {
    const bytes = Buffer.from(chunk); size += bytes.length;
    if (size > maximumResponseBytes) { response.destroy(); throw invalid(); } chunks.push(bytes);
  }
  try { return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(chunks))) as { choices?: Array<{ message?: { content?: unknown } }> }; }
  catch { throw invalid(); }
}
export async function requestLocalKeywordResponse(connection: LocalKeywordModelConnection, body: string, signal: AbortSignal) {
  // A dedicated Agent has no proxyEnv. Global HTTP_PROXY/NODE_USE_ENV_PROXY cannot reroute image bytes.
  const agent = new http.Agent({ keepAlive: false, maxSockets: 1 });
  try {
    return await new Promise<Awaited<ReturnType<typeof readResponse>>>((resolve, reject) => {
      const request = http.request({ hostname: "127.0.0.1", port: Number(connection.baseUrl.slice(connection.baseUrl.lastIndexOf(":") + 1)),
        path: "/v1/chat/completions", method: "POST", agent, signal,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "Accept-Encoding": "identity" }
      }, response => { void readResponse(response).then(resolve, reject); });
      request.once("error", reject); request.end(body);
    });
  } finally { agent.destroy(); }
}
