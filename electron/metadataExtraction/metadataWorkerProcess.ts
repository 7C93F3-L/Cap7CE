import { readArchiveMetadata } from "../../core/artifacts/file-facts/core/node/fileFacts/domain/archiveMetadataReader";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { inspectImageMetadata } from "../../core/artifacts/file-facts/core/node/fileFacts/domain/imageMetadataInspector";
import { flattenImageMetadataProperties } from "../../core/artifacts/file-facts/core/node/fileFacts/domain/imageMetadataMetrics";
import { VideoMetadataFrameClient } from "./videoMetadataFrameClient";
import { videoMetadataProperties } from "./videoMetadataFrames";
import { inspectVideoFactBatch } from "../../core/artifacts/file-facts/core/node/fileFacts/domain/videoFactInspector";
import { inspectAudioFactBatch } from "../../core/artifacts/file-facts/core/node/fileFacts/domain/audioFactInspector";
import { inspectTextDataMetadata } from "./textDataMetadataInspector";
import { inspectThreeDMetadata } from "./threeDMetadataInspector";
import { inspectDocumentMetadata } from "./documentMetadataInspector";
import { inspectModelFactBatch } from "../../core/artifacts/file-facts/core/node/fileFacts/domain/modelFactInspector";
import { inspectFontFactBatch } from "../../core/artifacts/file-facts/core/node/fileFacts/domain/fontFactInspector";
import type { MetadataWorkerTask, MetadataWorkerResult } from "./metadataWorkerTypes";
import { metadataWorkerTransport } from "./metadataWorkerTransport";

sharp.concurrency(1);
sharp.cache(false);
let active: AbortController | undefined;
let stopping = false;
const videoFrames = new VideoMetadataFrameClient(process.env.CAP7CE_VIDEO_FRAME_HELPER);
const finish = async () => { await videoFrames.close(); process.exit(0); };

const stop = () => {
  stopping = true;
  active?.abort();
  if (!active) void finish();
};
process.on("disconnect", stop);

const extract = async (task: MetadataWorkerTask, signal: AbortSignal): Promise<MetadataWorkerResult> => {
  // The broker performs native volume/file identity checks before and after this call.
  // Independently reject UNC/device paths and directly linked files here.
  if (!/^[a-z]:[\\/]/i.test(task.filePath) || task.filePath.includes("\0")) {
    return { state: "failed", errorCode: "metadata-path-rejected" };
  }
  const source = await fs.lstat(task.filePath);
  if (!source.isFile() || source.isSymbolicLink()) return { state: "failed", errorCode: "metadata-source-rejected" };
  if (signal.aborted) throw new Error("cancelled");
  if (task.kind === "image-dimensions") {
    const image = await inspectImageMetadata(path.normalize(task.filePath), signal);
    return image ? { state: "indexed", width: image.width, height: image.height, isAnimated: image.isAnimated,
      visualProperties: flattenImageMetadataProperties(image.properties) } : { state: "unsupported", errorCode: "image-dimensions-unsupported" };
  }
  if (task.kind === "archive") {
    try {
      const properties = await readArchiveMetadata(task.filePath, signal);
      return properties ? { state: "indexed", archiveProperties: properties } : { state: "unsupported", errorCode: "archive-metadata-unknown" };
    } catch (error) {
      if (signal.aborted) throw error;
      const code = error instanceof Error && /^archive-[a-z-]+$/.test(error.message) ? error.message : "archive-fact-read-failed";
      return { state: "failed", errorCode: code };
    }
  }
  if (task.kind === "text-data") {
    try { return { state: "indexed", textDataProperties: await inspectTextDataMetadata(task.filePath, signal) }; }
    catch (error) {
      if (signal.aborted) throw error;
      const code = error instanceof Error && /^text-data-[a-z-]+$/.test(error.message) ? error.message : "text-data-fact-read-failed";
      return { state: "failed", errorCode: code };
    }
  }
  if (task.kind === "three-d") {
    try {
      const properties = await inspectThreeDMetadata(task.filePath, signal);
      return properties ? { state: "indexed", threeDProperties: properties } : { state: "unsupported", errorCode: "three-d-metadata-unknown" };
    } catch (error) {
      if (signal.aborted) throw error;
      const code = error instanceof Error && /^three-d-[a-z-]+$/.test(error.message) ? error.message : "three-d-fact-read-failed";
      return { state: "failed", errorCode: code };
    }
  }
  if (task.kind === "document") {
    try { return { state: "indexed", documentProperties: await inspectDocumentMetadata(task.filePath, signal) }; }
    catch (error) {
      if (signal.aborted) throw error;
      const code = error instanceof Error && /^(?:document|artboard|cdr|psd)-[a-z-]+$/.test(error.message)
        ? error.message : "document-fact-read-failed";
      return { state: "failed", errorCode: code };
    }
  }
  if (task.kind === "model") {
    const [model] = await inspectModelFactBatch([{ filePath: task.filePath, sourceRevision: "broker-owned" }], 9_000, signal);
    return model.status === "indexed" ? { state: "indexed", modelProperties: { parameterCount: model.parameterCount, precision: model.precision } }
      : { state: "failed", errorCode: model.errorCode };
  }
  if (task.kind === "font") {
    const [font] = await inspectFontFactBatch([{ filePath: task.filePath, sourceRevision: "broker-owned" }], 9_000, signal);
    return font.status === "indexed" ? { state: "indexed", fontProperties: { weight: font.weight, italic: font.italic,
      supportsLatin: font.supportsLatin, supportsChinese: font.supportsChinese, variable: font.variable } }
      : { state: "failed", errorCode: font.errorCode };
  }
  if (task.kind === "audio") {
    const [audio] = await inspectAudioFactBatch([{ filePath: task.filePath, sourceRevision: "broker-owned" }], 9_000, signal);
    return audio.status === "indexed" ? { state: "indexed", durationMilliseconds: audio.durationMs, channelCount: audio.channelCount }
      : { state: "failed", errorCode: audio.errorCode };
  }
  try {
    const frames = await videoFrames.extract(path.normalize(task.filePath), signal);
    if (frames?.state === "indexed") return { state: "indexed", width: frames.width, height: frames.height,
      durationMilliseconds: frames.durationMilliseconds, visualProperties: videoMetadataProperties(frames) };
  } catch (error) { if (signal.aborted) throw error; }
  signal.throwIfAborted();
  const [video] = await inspectVideoFactBatch([{ filePath: task.filePath, sourceRevision: "broker-owned" }], 9_000, signal);
  return video.status === "indexed"
    ? { state: "indexed", width: video.width, height: video.height, durationMilliseconds: video.durationMs }
    : { state: "failed", errorCode: video.errorCode };
};

const send = metadataWorkerTransport(async (message: unknown) => {
  if (!message || typeof message !== "object") return;
  const request = message as Record<string, unknown>;
  if (request.type === "stop") return stop();
  if (active || stopping || request.type !== "extract" || !Number.isSafeInteger(request.id)) return;
  const task = request.task as MetadataWorkerTask | undefined;
  if (!task || typeof task.filePath !== "string" || task.filePath.length > 32_768 ||
    !["image-dimensions", "video", "audio", "font", "model", "document", "three-d", "text-data", "archive"].includes(task.kind)) return;
  const controller = new AbortController();
  active = controller;
  let result: MetadataWorkerResult;
  try { result = await extract(task, controller.signal); }
  catch { result = { state: "failed", errorCode: "metadata-read-failed" }; }
  active = undefined;
  if (stopping) return finish();
  send({ id: request.id, result, residentBytes: process.memoryUsage().rss + videoFrames.residentBytes });
}, stop);
