import path from "node:path";
import type {
  EmbeddedSearchEvidence,
  EmbeddedSearchEvidenceKind,
  RawEmbeddedMetadata
} from "./embeddedMetadataTypes";

const maximumEvidenceTextLength = 64 * 1024;
const maximumEvidencePartLength = 8 * 1024;

const visualExtensions = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".avif", ".heic", ".heif",
  ".dng", ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".rw2", ".psd", ".psb", ".ai", ".pdf"
]);
const documentExtensions = new Set([".doc", ".docx", ".pdf", ".ppt", ".pptx", ".xls", ".xlsx", ".epub", ".mobi"]);
const audioExtensions = new Set([".flac", ".m4a", ".mp3", ".ogg", ".wav"]);
const videoExtensions = new Set([".avi", ".mkv", ".mp4", ".mov", ".webm"]);
const fontExtensions = new Set([".otf", ".ttf"]);

const softwareFamilies: Array<[RegExp, string]> = [
  [/\bphotoshop\b/iu, "photoshop"],
  [/\blightroom\b/iu, "lightroom"],
  [/\billustrator\b/iu, "illustrator"],
  [/\bcapture\s*one\b/iu, "capture one"],
  [/\baffinity\s+(?:photo|designer)\b/iu, "affinity"],
  [/\bcorel(?:draw|\s+photo-paint)\b/iu, "coreldraw"],
  [/\bblender\b/iu, "blender"]
];

const normalizePart = (value: unknown) => {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value)
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase()
    .slice(0, maximumEvidencePartLength);
};

const normalizeValues = (values: unknown[] | undefined) => {
  const unique = new Set<string>();
  for (const value of values ?? []) {
    if (Array.isArray(value)) {
      for (const nested of value) {
        const normalized = normalizePart(nested);
        if (normalized) unique.add(normalized);
      }
      continue;
    }
    const normalized = normalizePart(value);
    if (normalized) unique.add(normalized);
  }
  return [...unique];
};

const addEvidence = (
  output: EmbeddedSearchEvidence[],
  kind: EmbeddedSearchEvidenceKind,
  values: unknown[] | undefined
) => {
  const searchText = normalizeValues(values).join(" ").slice(0, maximumEvidenceTextLength);
  if (searchText) output.push({ kind, searchText });
};

const normalizeSoftwareFamilies = (values: unknown[] | undefined) => {
  const families = new Set<string>();
  for (const value of normalizeValues(values)) {
    for (const [pattern, family] of softwareFamilies) {
      if (pattern.test(value)) families.add(family);
    }
  }
  return [...families];
};

const normalizeCapturedAt = (value: unknown) => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value !== "string" && typeof value !== "number") return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

export const selectHighValueEmbeddedMetadata = (
  filePathOrExtension: string,
  raw: RawEmbeddedMetadata
) => {
  const extension = filePathOrExtension.startsWith(".")
    ? filePathOrExtension.toLowerCase()
    : path.extname(filePathOrExtension).toLowerCase();
  const isVisual = visualExtensions.has(extension);
  const isDocument = documentExtensions.has(extension);
  const isAudio = audioExtensions.has(extension);
  const isVideo = videoExtensions.has(extension);
  const isFont = fontExtensions.has(extension);
  const evidence: EmbeddedSearchEvidence[] = [];

  if (isVisual || isVideo) addEvidence(evidence, "visual_content", raw.visualDescriptions);
  if (isVisual || isDocument || isAudio || isVideo) {
    addEvidence(evidence, "embedded_title", raw.titles);
    addEvidence(evidence, "embedded_subject", raw.subjects);
    addEvidence(evidence, "embedded_description", raw.descriptions);
    addEvidence(evidence, "embedded_keywords", raw.keywords);
  }
  if (isVisual) addEvidence(evidence, "software_family", normalizeSoftwareFamilies(raw.software));
  if (isVisual) {
    addEvidence(evidence, "capture_device", [raw.cameraMake, raw.cameraModel]);
  }
  if (isAudio || isVideo) {
    addEvidence(evidence, "media_title", [raw.mediaTitle]);
    addEvidence(evidence, "media_artist", [raw.mediaArtist]);
    addEvidence(evidence, "media_album", [raw.mediaAlbum]);
  }
  if (isFont) {
    addEvidence(evidence, "font_family", [raw.fontFamily]);
    addEvidence(evidence, "font_style", [raw.fontStyle]);
  }

  return {
    evidence,
    capturedAt: isVisual ? normalizeCapturedAt(raw.capturedAt) : null
  };
};
