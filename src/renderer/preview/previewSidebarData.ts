import type { ImageIndexItem, PreviewWindowData } from "../../shared/types";

export const buildPreviewSidebarData = (item: ImageIndexItem): Pick<PreviewWindowData, "imageWidth" | "imageHeight" | "manualKeywords" | "userDescription" | "searchEvidence"> => ({
  imageWidth: item.imageWidth,
  imageHeight: item.imageHeight,
  manualKeywords: item.keywords,
  userDescription: item.userDescription,
  searchEvidence: item.searchEvidence
    ? { terms: item.searchEvidence.terms, classification: item.searchEvidence.classification }
    : null
});
