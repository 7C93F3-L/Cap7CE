import path from "node:path";
import { fileFormatCapabilityByExtension } from "../../resourceCatalog/domain/formats/formatCapabilities";
import type { ArchivePreviewData } from "../../../../src/shared/archivePreviewTypes";
import type { SearchArchiveContentType } from "../../resourceCatalog/domain/formats/archiveSearchFilters";

const programExtensions = new Set([".exe", ".msi", ".msix", ".appx", ".appxbundle", ".bat", ".cmd", ".ps1", ".vbs"]);

const classifyEntry = (entryPath: string): SearchArchiveContentType => {
  const extension = path.posix.extname(entryPath.replace(/\\/gu, "/")).toLowerCase();
  if (programExtensions.has(extension)) return "program";
  if (extension === ".pdf") return "document";
  const category = fileFormatCapabilityByExtension.get(extension)?.category;
  if (category === "visual") return "image";
  if (category === "video" || category === "audio" || category === "project" || category === "threeD") return category;
  if (category === "document" || category === "text" || category === "data") return "document";
  return "other";
};

export const deriveArchiveFact = (preview: ArchivePreviewData) => {
  const contentTypes = new Set<SearchArchiveContentType>();
  let fileCount = 0;
  let hasDirectories = false;
  for (const entry of preview.entries) {
    const normalizedPath = entry.path.replace(/\\/gu, "/");
    if (entry.directory) {
      hasDirectories = true;
      continue;
    }
    fileCount += 1;
    if (normalizedPath.includes("/")) hasDirectories = true;
    contentTypes.add(classifyEntry(normalizedPath));
  }
  const listingComplete = !preview.truncated;
  return {
    listingComplete,
    fileCountKnown: listingComplete,
    fileCount,
    structureKnown: listingComplete || hasDirectories,
    hasDirectories,
    contentTypes: [...contentTypes]
  };
};
