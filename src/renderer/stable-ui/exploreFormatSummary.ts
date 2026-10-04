import {
  canonicalizeSelectedFormats,
  getOtherFileTypeExtensions,
  getPrimaryFileTypeExtensions,
  type ExploreOtherFileType,
  type ExplorePrimaryFileType
} from "./exploreFormatFilters";

export type ExploreFormatSummaryItem =
  | { kind: "type"; value: ExplorePrimaryFileType | ExploreOtherFileType }
  | { kind: "format"; value: string };

const summaryTypes: Array<ExplorePrimaryFileType | ExploreOtherFileType> = [
  "image", "video", "audio", "document", "text", "project", "threeD", "archive", "data", "font", "model"
];

export const getExploreFormatSummary = (availableFormats: readonly string[], selectedExtensions: readonly string[]) => {
  const selected = new Set(selectedExtensions);
  const covered = new Set<string>();
  const items: ExploreFormatSummaryItem[] = [];
  for (const type of summaryTypes) {
    const extensions = type === "image" || type === "video" || type === "audio" || type === "document"
      ? getPrimaryFileTypeExtensions(availableFormats, type)
      : getOtherFileTypeExtensions(availableFormats, type);
    if (canonicalizeSelectedFormats(extensions).length < 2 || !extensions.every((extension) => selected.has(extension))) continue;
    items.push({ kind: "type", value: type });
    extensions.forEach((extension) => covered.add(extension));
  }
  canonicalizeSelectedFormats(selectedExtensions.filter((extension) => !covered.has(extension)))
    .forEach((value) => items.push({ kind: "format", value }));
  return items;
};
