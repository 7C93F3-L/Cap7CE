import { getReadyLlamaRuntimeConnection, startLlamaRuntime } from "./llamaRuntimeManager";
import {
  getPendingImageRecognitionCount,
  listPendingImageRecognitions,
  updateImageRecognition,
  updateImageRecognitionFailure,
  type PendingImageRecognitionItem
} from "./sqliteImageIndex";
import { loadModelInputImage } from "./visualRenderService";
import { deleteVisualCacheImage } from "./visualCacheService";

type LlamaVisionErrorCode =
  | "image_not_found"
  | "image_read_failed"
  | "request_timeout"
  | "json_parse_failed"
  | "model_response_error";

export type AiIndexPhase = "idle" | "checking" | "processing" | "completed" | "failed" | "cancelled";

export interface AiIndexProgress {
  phase: AiIndexPhase;
  total: number;
  current: number;
  currentFileName?: string;
  completed: number;
  failed: number;
  totalUnrecognized?: number;
  remainingUnrecognized?: number;
  cancellable?: boolean;
  message?: string;
}

export interface AiIndexResponse {
  total: number;
  completed: number;
  failed: number;
  cancelled?: boolean;
  errors: Array<{
    filePath: string;
    fileName: string;
    message: string;
  }>;
}

export interface RunAiIndexOptions {
  directoryId?: string;
  limit?: number;
  language?: ResolvedLanguage;
  onProgress?: (progress: AiIndexProgress) => void;
  shouldCancel?: () => boolean;
}

interface ChatCompletionResponse {
  choices?: Array<{
    finish_reason?: unknown;
    message?: {
      content?: unknown;
      reasoning_content?: unknown;
    };
  }>;
  error?: unknown;
}

interface RecognitionJson {
  caption?: unknown;
  description?: unknown;
  keywords?: unknown;
  tags?: unknown;
}

class LlamaVisionError extends Error {
  constructor(
    readonly code: LlamaVisionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "LlamaVisionError";
  }
}

const requestTimeoutMs = 180_000;
const maximumResponseErrorLength = 500;
const defaultBatchSize = 5;

const llamaVisionRecognitionPrompts: Record<ResolvedLanguage, string> = {
  "zh-CN": [
    "这是图片索引任务。请直接观察图片并生成最终结果。",
    "禁止输出思考过程、推理过程、分析步骤、解释、前言、结语或 Markdown 代码块。",
    "Return JSON only. No thinking. No reasoning. No explanations.",
    "只返回一个符合以下结构的有效 JSON 对象：",
    "{\"description\":\"中文自然语言描述\",\"tags\":[\"中文关键词1\",\"中文关键词2\"]}",
    "description：使用中文，描述可见主体、场景、风格、动作或姿态，不得为空。",
    "tags：使用中文短关键词数组，覆盖人物、场景、物体、风格、颜色、动作和构图等可见信息，不得为空。",
    "不要使用“优美、漂亮、好看、精美、图片、图像、画面”等低搜索价值词。",
    "最终响应必须从 { 开始并以 } 结束。"
  ].join("\n"),
  "en-US": [
    "This is an image-indexing task. Inspect the image directly and produce the final result.",
    "Do not output thinking, reasoning, analysis steps, explanations, introductions, conclusions, or Markdown code fences.",
    "Return JSON only. No thinking. No reasoning. No explanations.",
    "Return exactly one valid JSON object with this structure:",
    "{\"description\":\"Natural-language description in English\",\"tags\":[\"English keyword 1\",\"English keyword 2\"]}",
    "description: Use English to describe visible subjects, scenes, styles, actions, or poses. It must not be empty.",
    "tags: Use an array of short English search keywords covering visible people, scenes, objects, styles, colors, actions, and composition. It must not be empty.",
    "Do not use low-value search terms such as \"beautiful\", \"pretty\", \"nice\", \"image\", \"picture\", or \"artwork\".",
    "The final response must begin with { and end with }."
  ].join("\n")
};

export const getLlamaVisionRecognitionPrompt = (language: ResolvedLanguage) => (
  llamaVisionRecognitionPrompts[language]
);

const recognitionSchema = {
  type: "object",
  properties: {
    description: {
      type: "string"
    },
    tags: {
      type: "array",
      items: {
        type: "string"
      }
    }
  },
  required: ["description", "tags"],
  additionalProperties: false
};

const cleanTag = (value: string) => value
  .replace(/<think>[\s\S]*?<\/think>/gi, "")
  .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
  .replace(/[。.!！?？]+$/g, "")
  .trim();

const collectTags = (value: unknown) => {
  const rawTags = Array.isArray(value)
    ? value.map(String)
    : typeof value === "string"
      ? value.split(/[,，、;；\n\r\t]+/)
      : [];
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const rawTag of rawTags) {
    const tag = cleanTag(rawTag);
    const key = tag.toLowerCase();
    if (!tag || tag.length > 24 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(tag);
  }

  return tags.slice(0, 48);
};

const stripThinkAndMarkdown = (value: string) => value
  .replace(/<think>[\s\S]*?<\/think>/gi, "")
  .replace(/<think>[\s\S]*$/gi, "")
  .replace(/^\s*```(?:json)?\s*/i, "")
  .replace(/\s*```\s*$/i, "")
  .replace(/^\uFEFF/, "")
  .trim();

const findBalancedJsonObject = (value: string) => {
  const start = value.indexOf("{");
  if (start === -1) {
    return "";
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return "";
};

const repairCommonJsonIssues = (value: string) => value
  .replace(/[｛]/g, "{")
  .replace(/[｝]/g, "}")
  .replace(/[［]/g, "[")
  .replace(/[］]/g, "]")
  .replace(/[：]/g, ":")
  .replace(/[“”]/g, "\"")
  .replace(/([{,]\s*)(description|caption|tags|keywords)\s*:/gi, '$1"$2":')
  .replace(/,\s*([}\]])/g, "$1");

const parseRecognitionResponse = (value: string) => {
  if (!value.trim()) {
    throw new LlamaVisionError("model_response_error", "模型响应为空。");
  }

  const cleaned = stripThinkAndMarkdown(value);
  const balanced = findBalancedJsonObject(cleaned);
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const extracted = firstBrace >= 0 && lastBrace > firstBrace
    ? cleaned.slice(firstBrace, lastBrace + 1)
    : "";
  const candidates = [...new Set(
    [balanced, extracted, cleaned]
      .filter(Boolean)
      .flatMap((candidate) => [candidate, repairCommonJsonIssues(candidate)])
  )];

  let parsed: RecognitionJson | null = null;
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate) as RecognitionJson;
      break;
    } catch {
      continue;
    }
  }

  if (!parsed) {
    throw new LlamaVisionError("json_parse_failed", "模型响应无法解析为有效 JSON。");
  }

  const description = (
    typeof parsed.description === "string"
      ? parsed.description
      : typeof parsed.caption === "string"
        ? parsed.caption
        : ""
  ).replace(/\s+/g, " ").trim();
  const tags = collectTags([
    ...collectTags(parsed.tags),
    ...collectTags(parsed.keywords)
  ]);

  if (!description || tags.length === 0) {
    throw new LlamaVisionError(
      "json_parse_failed",
      !description ? "模型 JSON 缺少有效 description。" : "模型 JSON 缺少有效 tags。"
    );
  }

  return { description, tags };
};

const extractResponseText = (response: ChatCompletionResponse) => {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

const extractHttpError = (responseText: string, status: number) => {
  const trimmed = responseText.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: string | { message?: unknown };
        message?: unknown;
      };
      if (typeof parsed.error === "string") {
        return parsed.error.slice(0, maximumResponseErrorLength);
      }
      if (parsed.error && typeof parsed.error.message === "string") {
        return parsed.error.message.slice(0, maximumResponseErrorLength);
      }
      if (typeof parsed.message === "string") {
        return parsed.message.slice(0, maximumResponseErrorLength);
      }
    } catch {
      return trimmed.slice(0, maximumResponseErrorLength);
    }
  }
  return `HTTP ${status}`;
};

const readImage = async (imagePath: string) => {
  const normalizedPath = imagePath.trim();
  if (!normalizedPath) {
    throw new LlamaVisionError("image_not_found", "图片读取失败：未提供图片路径。");
  }

  try {
    const modelInput = await loadModelInputImage(normalizedPath);
    return {
      normalizedPath,
      modelInputImagePath: modelInput.imagePath,
      dataUrl: `data:${modelInput.mimeType};base64,${modelInput.buffer.toString("base64")}`
    };
  } catch (error) {
    if (error instanceof LlamaVisionError) {
      throw error;
    }
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new LlamaVisionError("image_not_found", `图片读取失败（ENOENT）：图片不存在：${normalizedPath}`);
    }
    const message = error instanceof Error ? error.message : "无法生成模型输入图";
    throw new LlamaVisionError(
      "image_read_failed",
      `图片读取失败：模型输入图生成失败（${code ?? "RENDER_FAILED"}）：${message}`
    );
  }
};

const requestRecognition = async (
  baseUrl: string,
  modelName: string,
  dataUrl: string,
  prompt: string
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName,
        stream: false,
        temperature: 0,
        max_tokens: 768,
        reasoning_format: "none",
        chat_template_kwargs: {
          enable_thinking: false
        },
        response_format: {
          type: "json_schema",
          schema: recognitionSchema
        },
        messages: [{
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: dataUrl
              }
            },
            {
              type: "text",
              text: prompt
            }
          ]
        }]
      }),
      signal: controller.signal
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new LlamaVisionError(
        "model_response_error",
        `模型请求失败：${extractHttpError(responseText, response.status)}`
      );
    }

    let data: ChatCompletionResponse;
    try {
      data = JSON.parse(responseText) as ChatCompletionResponse;
    } catch {
      throw new LlamaVisionError("model_response_error", "llama-server 返回了无效的 HTTP JSON 响应。");
    }
    if (data.error) {
      throw new LlamaVisionError(
        "model_response_error",
        `模型响应异常：${extractHttpError(JSON.stringify(data), response.status)}`
      );
    }

    const responseContent = extractResponseText(data);
    if (!responseContent) {
      throw new LlamaVisionError("model_response_error", "模型响应中没有可用文本。");
    }
    return parseRecognitionResponse(responseContent);
  } catch (error) {
    if (error instanceof LlamaVisionError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new LlamaVisionError(
        "request_timeout",
        `图片识别请求超过 ${requestTimeoutMs / 1_000} 秒未完成。`
      );
    }
    const message = error instanceof Error ? error.message : "未知请求错误";
    throw new LlamaVisionError("model_response_error", `无法请求 llama-server：${message}`);
  } finally {
    clearTimeout(timeout);
  }
};

const emitProgress = (onProgress: RunAiIndexOptions["onProgress"], progress: AiIndexProgress) => {
  onProgress?.(progress);
};

const ensureLlamaVisionRuntime = async () => {
  const existingConnection = await getReadyLlamaRuntimeConnection();
  if (existingConnection) {
    return existingConnection;
  }

  const state = await startLlamaRuntime();
  if (state.status !== "running" || state.modelStatus !== "loaded") {
    throw new Error(state.modelMessage || state.message || "llama-server 启动或视觉模型加载失败。");
  }

  const connection = await getReadyLlamaRuntimeConnection();
  if (!connection) {
    throw new Error("llama-server 已启动，但健康检查或模型状态不可用。");
  }
  return connection;
};

const recognizeIndexedImage = async (
  connection: { baseUrl: string; modelName: string },
  image: PendingImageRecognitionItem,
  prompt: string
) => {
  const loadedImage = await readImage(image.filePath);
  return {
    recognition: await requestRecognition(connection.baseUrl, connection.modelName, loadedImage.dataUrl, prompt),
    modelInputImagePath: loadedImage.modelInputImagePath
  };
};

const persistRecognitionFailure = async (image: PendingImageRecognitionItem, message: string) => {
  try {
    await updateImageRecognitionFailure(image.id, message, new Date().toISOString());
    return message;
  } catch (error) {
    const storageMessage = error instanceof Error ? error.message : String(error);
    return `${message}；失败状态写入数据库失败：${storageMessage}`;
  }
};

export const runContinuousAiIndex = async (
  options: RunAiIndexOptions = {}
): Promise<AiIndexResponse> => {
  const batchSize = options.limit ?? defaultBatchSize;
  const recognitionPrompt = getLlamaVisionRecognitionPrompt(options.language ?? "zh-CN");
  const total = await getPendingImageRecognitionCount(options.directoryId);
  const attemptedIds = new Set<number>();
  let completed = 0;
  let failed = 0;
  const errors: AiIndexResponse["errors"] = [];

  const processed = () => completed + failed;
  const remaining = () => Math.max(0, total - processed());
  const isCancelled = () => options.shouldCancel?.() === true;
  const cancelledResponse = (): AiIndexResponse => ({
    total,
    completed,
    failed,
    cancelled: true,
    errors
  });
  const emitCancelled = () => emitProgress(options.onProgress, {
    phase: "cancelled",
    total,
    current: processed(),
    completed,
    failed,
    totalUnrecognized: total,
    remainingUnrecognized: remaining(),
    cancellable: false,
    message: t("recognition.cancelled")
  });

  emitProgress(options.onProgress, {
    phase: "checking",
    total,
    current: 0,
    completed,
    failed,
    totalUnrecognized: total,
    remainingUnrecognized: total,
    cancellable: true,
    message: t("recognition.readingPending")
  });

  if (total === 0) {
    emitProgress(options.onProgress, {
      phase: "completed",
      total,
      current: 0,
      completed,
      failed,
      totalUnrecognized: total,
      remainingUnrecognized: 0,
      cancellable: false,
      message: t("recognition.noPending")
    });
    return { total, completed, failed, errors };
  }

  if (isCancelled()) {
    emitCancelled();
    return cancelledResponse();
  }

  emitProgress(options.onProgress, {
    phase: "checking",
    total,
    current: 0,
    completed,
    failed,
    totalUnrecognized: total,
    remainingUnrecognized: total,
    cancellable: true,
    message: t("recognition.startingRuntime")
  });

  const connection = await ensureLlamaVisionRuntime();

  while (processed() < total) {
    if (isCancelled()) {
      emitCancelled();
      return cancelledResponse();
    }

    const pendingImages = await listPendingImageRecognitions(
      batchSize,
      [...attemptedIds],
      options.directoryId
    );
    if (pendingImages.length === 0) {
      break;
    }

    for (const image of pendingImages) {
      if (isCancelled()) {
        emitCancelled();
        return cancelledResponse();
      }

      attemptedIds.add(image.id);
      emitProgress(options.onProgress, {
        phase: "processing",
        total,
        current: processed() + 1,
        currentFileName: image.fileName,
        completed,
        failed,
        totalUnrecognized: total,
        remainingUnrecognized: remaining(),
        cancellable: true,
        message: t("recognition.processing", { current: processed() + 1, total })
      });

      try {
        const result = await recognizeIndexedImage(connection, image, recognitionPrompt);
        await updateImageRecognition(
          image.id,
          result.recognition.description,
          result.recognition.tags,
          new Date().toISOString()
        );
        completed += 1;
        await deleteVisualCacheImage(
          result.modelInputImagePath,
          "model-input-image"
        ).catch((error) => {
          console.warn("[model-input-cache] successful recognition cache cleanup failed", {
            filePath: image.filePath,
            message: error instanceof Error ? error.message : String(error)
          });
        });
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : t("recognition.failed");
        const persistedMessage = await persistRecognitionFailure(image, message);
        errors.push({
          filePath: image.filePath,
          fileName: image.fileName,
          message: persistedMessage
        });
      }

      emitProgress(options.onProgress, {
        phase: "processing",
        total,
        current: processed(),
        currentFileName: image.fileName,
        completed,
        failed,
        totalUnrecognized: total,
        remainingUnrecognized: remaining(),
        cancellable: true,
        message: t("recognition.progressSummary", { completed, failed })
      });
    }
  }

  emitProgress(options.onProgress, {
    phase: "completed",
    total,
    current: processed(),
    completed,
    failed,
    totalUnrecognized: total,
    remainingUnrecognized: remaining(),
    cancellable: false,
    message: t("recognition.completedSummary", { completed, failed })
  });

  return { total, completed, failed, errors };
};
import { t, type ResolvedLanguage } from "./localization";
