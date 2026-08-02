import path from "node:path";
import { getFileFormatCapability } from "./formatCapabilities";
import { scanImageDirectories, type ImageScanControl, type ScannedFile, type ScannedImageFile } from "./imageScanner";
import type { PersistedDirectory } from "./directoryStore";
import { listExistingImageFilePaths, searchIndexedFiles, searchIndexedImages, type FileCatalogSearchResult, type ImageSearchResult, type ImageSearchState, type ImageSearchResponse } from "./sqliteImageIndex";

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
  resultKind: "visual",
  filePath: image.file_path,
  fileName: image.file_name,
  extension: path.extname(image.file_name).toLowerCase(),
  iconName: "skim-file",
  previewKind: "image",
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

const toNonVisualResult = (file: ScannedFile | FileCatalogSearchResult): ImageSearchResult | null => {
  const extension = file.extension;
  const capability = getFileFormatCapability(extension);
  if (!capability?.canSearch || capability.canAIIndex) return null;
  const filePath = "file_path" in file ? file.file_path : file.filePath;
  const fileName = "file_name" in file ? file.file_name : file.fileName;
  return {
    id: `file:${filePath}`,
    resultKind: "file",
    filePath,
    fileName,
    extension,
    iconName: capability.iconName,
    previewKind: capability.previewKind,
    fileSize: "file_size" in file ? file.file_size : file.fileSize,
    createdAt: "created_at" in file ? file.created_at : file.createdAt,
    modifiedAt: "modified_at" in file ? file.modified_at : file.modifiedAt,
    imageWidth: 0,
    imageHeight: 0,
    caption: "",
    keywords: [],
    aiError: "",
    manualIndex: false,
    failureType: "pending",
    failureLabel: "",
    indexedAt: "indexedAt" in file ? file.indexedAt : "",
    thumbnailUrl: ""
  };
};

const scanAddedDirectories = async (
  directories: PersistedDirectory[],
  search: ImageSearchState,
  control?: ImageScanControl
) => {
  const directoriesToScan = targetDirectories(directories, search.directoryId);
  if (directoriesToScan.length === 0) {
    return { images: [], files: [] };
  }

  return scanImageDirectories(directoriesToScan, control);
};

type ImageSearchWithFormatsResponse = ImageSearchResponse & { availableFormats: string[] };

export const searchImagesWithAddedDirectories = async (
  search: ImageSearchState,
  directories: PersistedDirectory[],
  onScannedImages?: (images: ScannedImageFile[]) => void,
  control?: ImageScanControl
): Promise<ImageSearchWithFormatsResponse> => {
  const [indexed, indexedFiles, scanResult] = await Promise.all([
    searchIndexedImages(search),
    searchIndexedFiles(search),
    scanAddedDirectories(directories, search, control)
  ]);
  if (control?.isCancelled()) {
    throw Object.assign(new Error("Image search cancelled."), { code: "ECANCELED" });
  }
  const terms = toSearchTerms(search.query);
  const scannedImages = scanResult.images;
  const scannedFiles = scanResult.files;
  onScannedImages?.(scannedImages);
  const availableFormatFiles = search.recognitionStatus === "all" ? scannedFiles : scannedImages;
  const availableFormats = Array.from(new Set(availableFormatFiles.map((file) => getFileFormat(file.file_name)).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));
  const selectedFileFormat = normalizeFileFormat(search.fileFormat);
  const formatFilteredImages = selectedFileFormat === "all"
    ? scannedImages
    : scannedImages.filter((image) => getFileFormat(image.file_name) === selectedFileFormat);
  const existingPaths = await listExistingImageFilePaths(search.directoryId);
  const indexedResultPaths = new Set(indexed.images.map((image) => image.filePath));
  const unindexedImages = formatFilteredImages.filter((image) => !existingPaths.has(image.file_path));
  const normalizedTerms = terms.map((term) => term.toLocaleLowerCase());
  const scannedNonVisualFiles = search.recognitionStatus === "all"
    ? scannedFiles
      .filter((file) => !getFileFormatCapability(file.extension)?.canAIIndex)
      .filter((file) => selectedFileFormat === "all" || getFileFormat(file.file_name) === selectedFileFormat)
      .filter((file) => normalizedTerms.every((term) => file.file_name.toLocaleLowerCase().includes(term)))
    : [];
  const nonVisualResultByPath = new Map<string, ImageSearchResult>();
  for (const file of indexedFiles) {
    const result = toNonVisualResult(file);
    if (result) nonVisualResultByPath.set(result.filePath.toLocaleLowerCase(), result);
  }
  for (const file of scannedNonVisualFiles) {
    const result = toNonVisualResult(file);
    if (result) nonVisualResultByPath.set(result.filePath.toLocaleLowerCase(), result);
  }
  const nonVisualResults = [...nonVisualResultByPath.values()];

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
    const pendingImages = unindexedImages
      .filter((image) => normalizedTerms.every((term) => image.file_name.toLocaleLowerCase().includes(term)))
      .filter((image) => !indexedResultPaths.has(image.file_path))
      .map(scannedImageToResult);

    return {
      images: [...indexed.images, ...pendingImages, ...nonVisualResults].sort(compareImages(search)),
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
      .map(scannedImageToResult),
    ...nonVisualResults
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
