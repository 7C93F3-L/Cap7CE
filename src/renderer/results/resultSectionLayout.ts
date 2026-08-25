import type { ImageIndexItem, SearchEvidenceClass } from "../../shared/types";

export type ResultDisplaySection = "fastMatch" | "possibleSimilarity" | "aiDeepMatch";

const displaySectionByEvidenceClass: Record<SearchEvidenceClass, ResultDisplaySection> = {
  userMetadata: "fastMatch",
  fileName: "fastMatch",
  fileFormat: "fastMatch",
  naturalCondition: "fastMatch",
  directoryPath: "fastMatch",
  embeddedMetadata: "fastMatch",
  aiMetadata: "possibleSimilarity",
  visualSimilarity: "possibleSimilarity",
  aiDeepMatch: "aiDeepMatch"
};

export const getResultDisplaySection = (classification: SearchEvidenceClass) => (
  displaySectionByEvidenceClass[classification]
);

export type ResultGridLayoutItem =
  | { kind: "section"; key: string; section: ResultDisplaySection }
  | { kind: "file"; key: string; fileIndex: number; item: ImageIndexItem };

export const buildResultGridLayoutItems = (images: ImageIndexItem[], includeAiStatusSection = false): ResultGridLayoutItem[] => {
  const hasSections = includeAiStatusSection || images.some((image) => image.searchEvidence !== null);
  if (!hasSections) {
    return images.map((item, fileIndex) => ({ kind: "file", key: `file:${item.id}`, fileIndex, item }));
  }

  const layoutItems: ResultGridLayoutItem[] = [];
  let previousSection: ResultDisplaySection | null = null;
  let sectionOccurrence = 0;
  let hasAiSection = false;
  images.forEach((item, fileIndex) => {
    const section = item.searchEvidence
      ? getResultDisplaySection(item.searchEvidence.classification)
      : null;
    if (section && section !== previousSection) {
      if (section === "aiDeepMatch") hasAiSection = true;
      sectionOccurrence += 1;
      layoutItems.push({
        kind: "section",
        key: `section:${section}:${sectionOccurrence}`,
        section
      });
    }
    layoutItems.push({ kind: "file", key: `file:${item.id}`, fileIndex, item });
    previousSection = section;
  });
  if (includeAiStatusSection && !hasAiSection) {
    layoutItems.push({ kind: "section", key: "section:aiDeepMatch:status", section: "aiDeepMatch" });
  }
  return layoutItems;
};

export const getResultLayoutIndexForFileIndex = (
  layoutItems: ResultGridLayoutItem[],
  fileIndex: number
) => layoutItems.findIndex((layoutItem) => layoutItem.kind === "file" && layoutItem.fileIndex === fileIndex);

export const getNavigatedResultFileIndex = (
  layoutItems: ResultGridLayoutItem[],
  currentFileIndex: number,
  direction: "left" | "right" | "up" | "down",
  columnCount: number
) => {
  const currentLayoutIndex = getResultLayoutIndexForFileIndex(layoutItems, currentFileIndex);
  if (currentLayoutIndex < 0) return currentFileIndex;
  const stride = direction === "up" || direction === "down" ? Math.max(1, columnCount) : 1;
  const step = direction === "left" || direction === "up" ? -1 : 1;
  let targetLayoutIndex = currentLayoutIndex + step * stride;

  while (targetLayoutIndex >= 0 && targetLayoutIndex < layoutItems.length) {
    const target = layoutItems[targetLayoutIndex];
    if (target.kind === "file") return target.fileIndex;
    targetLayoutIndex += step;
  }
  return currentFileIndex;
};
