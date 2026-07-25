import path from "node:path";
import { scanImageDirectories, type ScannedImageFile } from "./imageScanner";
import type { PersistedDirectory } from "./directoryStore";
import { listExistingImageFilePaths, searchIndexedImages, type ImageSearchResult, type ImageSearchState, type ImageSearchResponse } from "./sqliteImageIndex";

const toSearchTerms = (query: string) => query.trim().split(/\s+/).filter(Boolean);

const canonicalizeFileFormat = (fileFormat: string) => {
  if (fileFormat === "jpeg") return "jpg";
  if (fileFormat === "tiff") return "tif";
  return fileFormat;
};

const getFileFormat = (fileName: string) => canonicalizeFileFormat(path.extname(fileName).slice(1).toLowerCase());

const normalizeFileFormat = (value: unknown) => {
  const normalized = typeof value === "string" ? value.trim().replace(/^\./, "").toLowerCase() : "";
  return normalized && /^[a-z0-9]+$/.test(normalized) ? canonicalizeFileFormat(normalized) : "all";
};

const toThumbnailUrl = (filePath: string) => `cap7ce://thumbnail/?path=${encodeURIComponent(filePath)}`;

const compareText = (left: string, right: string) => left.localeCompare(right, "zh-Hans-CN", {
  numeric: true,
  sensitivity: "base"
});

const compareImages = (search: ImageSearchState) => (left: ImageSearchResult, right: ImageSearchResult) => {
  const direction = search.sortDirection === "desc" ? -1 : 1;
  let result = 0;

  if (search.sortField === "modified_at") {
    result = new Date(left.modifiedAt).getTime() - new Date(right.modifiedAt).getTime();
  } else {
    result = compareText(left.fileName, right.fileName);
  }

  if (result === 0) {
    result = compareText(left.filePath, right.filePath);
  }

  return result * direction;
};

const targetDirectories = (directories: PersistedDirectory[], directoryId: string) => (
  directoryId === "all" ? directories : directories.filter((directory) => directory.id === directoryId)
);

const scannedImageToResult = (image: ScannedImageFile): ImageSearchResult => ({
  id: `file:${image.file_path}`,
  filePath: image.file_path,
  fileName: image.file_name,
  fileSize: image.file_size,
  createdAt: image.created_at,
  modifiedAt: image.modified_at,
  imageWidth: 0,
  imageHeight: 0,
  caption: "",
  keywords: [],
  aiError: "",
  manualIndex: false,
  failureType: "pending",
  failureLabel: t("recognition.pending"),
  indexedAt: "",
  thumbnailUrl: toThumbnailUrl(image.file_path)
});

const scanAddedDirectoryImages = async (directories: PersistedDirectory[], search: ImageSearchState) => {
  const directoriesToScan = targetDirectories(directories, search.directoryId);
  if (directoriesToScan.length === 0) {
    return [];
  }

  const scanResult = await scanImageDirectories(directoriesToScan);
  return scanResult.images;
};

type ImageSearchWithFormatsResponse = ImageSearchResponse & { availableFormats: string[] };

export const searchImagesWithAddedDirectories = async (
  search: ImageSearchState,
  directories: PersistedDirectory[],
  onScannedImages?: (images: ScannedImageFile[]) => void
): Promise<ImageSearchWithFormatsResponse> => {
  const indexed = await searchIndexedImages(search);
  const terms = toSearchTerms(search.query);
  const scannedImages = await scanAddedDirectoryImages(directories, search);
  onScannedImages?.(scannedImages);
  const availableFormats = Array.from(new Set(scannedImages.map((image) => getFileFormat(image.file_name)).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));
  const selectedFileFormat = normalizeFileFormat(search.fileFormat);
  const formatFilteredImages = selectedFileFormat === "all"
    ? scannedImages
    : scannedImages.filter((image) => getFileFormat(image.file_name) === selectedFileFormat);
  const existingPaths = await listExistingImageFilePaths(search.directoryId);
  const indexedResultPaths = new Set(indexed.images.map((image) => image.filePath));
  const unindexedImages = formatFilteredImages.filter((image) => !existingPaths.has(image.file_path));

  if (search.recognitionStatus === "recognized") {
    return {
      images: indexed.images,
      availableFormats,
      unrecognizedCount: indexed.unrecognizedCount + unindexedImages.length,
      skippedUnrecognizedCount: 0,
      failureStats: indexed.failureStats
    };
  }

  if (search.recognitionStatus === "unrecognized") {
    const normalizedTerms = terms.map((term) => term.toLocaleLowerCase());
    const pendingImages = unindexedImages
      .filter((image) => normalizedTerms.every((term) => image.file_name.toLocaleLowerCase().includes(term)))
      .filter((image) => !indexedResultPaths.has(image.file_path))
      .map(scannedImageToResult);

    return {
      images: [...indexed.images, ...pendingImages].sort(compareImages(search)),
      availableFormats,
      unrecognizedCount: indexed.unrecognizedCount + unindexedImages.length,
      skippedUnrecognizedCount: 0,
      failureStats: indexed.failureStats
    };
  }

  if (terms.length > 0) {
    const unrecognizedCount = indexed.unrecognizedCount + unindexedImages.length;
    const normalizedTerms = terms.map((term) => term.toLocaleLowerCase());
    const pendingImages = unindexedImages
      .filter((image) => normalizedTerms.every((term) => image.file_name.toLocaleLowerCase().includes(term)))
      .filter((image) => !indexedResultPaths.has(image.file_path))
      .map(scannedImageToResult);

    return {
      images: [...indexed.images, ...pendingImages].sort(compareImages(search)),
      availableFormats,
      unrecognizedCount,
      skippedUnrecognizedCount: unrecognizedCount,
      failureStats: indexed.failureStats
    };
  }

  const images = [
    ...indexed.images,
    ...unindexedImages
      .filter((image) => !indexedResultPaths.has(image.file_path))
      .map(scannedImageToResult)
  ].sort(compareImages(search));

  return {
    images,
    availableFormats,
    unrecognizedCount: indexed.unrecognizedCount + unindexedImages.length,
    skippedUnrecognizedCount: 0,
    failureStats: indexed.failureStats
  };
};
import { t } from "./localization";
