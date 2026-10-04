import { fileFormatCapabilities, type FileFormatCategory } from "../../../electron/formatCapabilities";

export type ExplorePrimaryFileType = "image" | "video" | "audio" | "document";
export type ExploreOtherFileType = "text" | "project" | "threeD" | "archive" | "data" | "font" | "model";

const canonicalFormat = (extension: string) => {
  const normalized = extension.trim().replace(/^\./, "").toLowerCase();
  if (normalized === "jpeg") return "jpg";
  if (normalized === "tiff") return "tif";
  return normalized;
};

const primaryCategories: Record<ExplorePrimaryFileType, readonly FileFormatCategory[]> = {
  image: ["visual"],
  video: ["video"],
  audio: ["audio"],
  document: ["document"]
};

const otherCategory: Record<ExploreOtherFileType, FileFormatCategory> = {
  text: "text",
  project: "project",
  threeD: "threeD",
  archive: "archive",
  data: "data",
  font: "font",
  model: "model"
};

export const getAvailableSearchExtensions = (availableFormats: readonly string[]) => {
  const available = new Set(availableFormats.map(canonicalFormat));
  return fileFormatCapabilities
    .filter((capability) => capability.canSearch && available.has(canonicalFormat(capability.extension)))
    .map((capability) => capability.extension);
};

const getExtensionsForCategories = (availableFormats: readonly string[], categories: readonly FileFormatCategory[]) => {
  const categorySet = new Set(categories);
  const availableExtensions = new Set(getAvailableSearchExtensions(availableFormats));
  return fileFormatCapabilities
    .filter((capability) => capability.canSearch && categorySet.has(capability.extension === ".pdf" ? "document" : capability.category) && availableExtensions.has(capability.extension))
    .map((capability) => capability.extension);
};

export const getPrimaryFileTypeExtensions = (availableFormats: readonly string[], type: ExplorePrimaryFileType) => (
  getExtensionsForCategories(availableFormats, primaryCategories[type])
);

export const getOtherFileTypeExtensions = (availableFormats: readonly string[], type: ExploreOtherFileType) => (
  getExtensionsForCategories(availableFormats, [otherCategory[type]])
);

export const getFormatSelectionGroups = (availableFormats: readonly string[]) => {
  const available = new Set(availableFormats.map(canonicalFormat));
  const groups = new Map<FileFormatCategory, string[]>();
  for (const capability of fileFormatCapabilities) {
    const format = canonicalFormat(capability.extension);
    if (!capability.canSearch || !available.has(format)) continue;
    const category = capability.extension === ".pdf" ? "document" : capability.category;
    const formats = groups.get(category) ?? [];
    if (!formats.includes(format)) formats.push(format);
    groups.set(category, formats);
  }
  return groups;
};
export const getExtensionsForCanonicalFormat = (format: string) => fileFormatCapabilities
  .filter((capability) => capability.canSearch && canonicalFormat(capability.extension) === canonicalFormat(format))
  .map((capability) => capability.extension);
export const canonicalizeSelectedFormats = (selectedExtensions: readonly string[]) => [
  ...new Set(selectedExtensions.map(canonicalFormat))
];
export const isImageOnlyExtensionSelection = (selectedExtensions: readonly string[]) => selectedExtensions.length > 0 && selectedExtensions.every((extension) => extension !== ".pdf" && fileFormatCapabilities.find((capability) => capability.extension === extension)?.category === "visual");
export const isVideoOnlyExtensionSelection = (selectedExtensions: readonly string[]) => selectedExtensions.length > 0 && selectedExtensions.every((extension) => fileFormatCapabilities.find((capability) => capability.extension === extension)?.category === "video");
