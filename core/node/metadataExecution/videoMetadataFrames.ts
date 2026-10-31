import { analyzeVisualProperties } from "../fileFacts/domain/visualPropertyAnalyzer";
import { flattenImageMetadataProperties, type ImageMetadataProperties } from "../fileFacts/domain/imageMetadataMetrics";

export { CORE_VIDEO_METADATA_EXTRACTOR_VERSION } from "../fileFacts/domain/metadataExtractorVersions";
export interface VideoMetadataFrameResponse {
  id: number; state: "indexed" | "unavailable"; width: number; height: number;
  durationMilliseconds: number; frames: { width: number; height: number; rgba: string }[]; residentBytes: number;
}
export const readVideoMetadataFrames = (value: unknown, id: number): VideoMetadataFrameResponse => {
  const invalid = (): never => { throw new Error("metadata-video-invalid-frame-response"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const result = value as VideoMetadataFrameResponse;
  if (Object.keys(result).some(key => !["id", "state", "width", "height", "durationMilliseconds", "frames", "residentBytes"].includes(key))
    || result.id !== id || !Number.isSafeInteger(result.residentBytes) || result.residentBytes < 0 || result.residentBytes > 8 * 1024 ** 3
    || !Array.isArray(result.frames)) return invalid();
  if (result.state === "unavailable") {
    if (result.width !== 0 || result.height !== 0 || result.durationMilliseconds !== 0 || result.frames.length) return invalid();
    return result;
  }
  if (result.state !== "indexed" || result.frames.length !== 3 || !Number.isSafeInteger(result.durationMilliseconds)
    || result.durationMilliseconds < 1 || ![result.width, result.height].every(size => Number.isSafeInteger(size) && size >= 1 && size <= 65535)) return invalid();
  for (const frame of result.frames) {
    if (!frame || typeof frame !== "object" || Array.isArray(frame) || Object.keys(frame).some(key => !["width", "height", "rgba"].includes(key))
      || ![frame.width, frame.height].every(size => Number.isSafeInteger(size) && size >= 1 && size <= 160)
      || typeof frame.rgba !== "string" || frame.rgba.length !== Math.ceil(frame.width * frame.height * 4 / 3) * 4
      || Buffer.from(frame.rgba, "base64").toString("base64") !== frame.rgba
      || Buffer.from(frame.rgba, "base64").length !== frame.width * frame.height * 4) return invalid();
  }
  return result;
};
export const videoMetadataProperties = (response: VideoMetadataFrameResponse): ImageMetadataProperties | null => {
  if (response.state !== "indexed") return null;
  const observations = response.frames.map(frame => flattenImageMetadataProperties(analyzeVisualProperties({
    data: Buffer.from(frame.rgba, "base64"), width: frame.width, height: frame.height
  }))!);
  return Object.fromEntries(Object.keys(observations[0]).map(key => [key,
    Math.round(observations.reduce((sum, properties) => sum + properties[key], 0) / observations.length)]));
};
