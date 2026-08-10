import path from "node:path";
import type { PersistedDirectory } from "./directoryStore";
import { getFileFormatCapability } from "./formatCapabilities";
import type { ImageScanControl, ImageScanResult, ScannedFile, ScannedImageFile } from "./imageScanner";
import { t } from "./localization";
import { fileMatchesDeterministicSearchTerms, getDirectoryTermMatches, toSearchTerms } from "./searchPathEvidence";
import { searchScanSnapshotService } from "./searchScanSnapshotService";
import { searchIndexedCatalog, type ImageSearchResult, type ImageSearchState, type ImageSearchResponse } from "./sqliteImageIndex";

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
const filePathKey = (filePath: string) => path.normalize(path.resolve(filePath)).toLocaleLowerCase();
const getIncludedExtensionSet = (includedExtensions: string[] | undefined) => includedExtensions
  ? new Set(includedExtensions.map((extension) => extension.toLowerCase()))
  : null;

const compareText = (left: string, right: string) => left.localeCompare(right, "zh-Hans-CN", {
  numeric: true,
  sensitivity: "base"
});

const compareImages = (search: ImageSearchState) => (left: ImageSearchResult, right: ImageSearchResult) => {
  const direction = search.sortDirection === "desc" ? -1 : 1;
  let result = search.sortField === "modified_at"
    ? new Date(left.modifiedAt).getTime() - new Date(right.modifiedAt).getTime()
    : compareText(left.fileName, right.fileName);
  if (result === 0) result = compareText(left.filePath, right.filePath);
  return result * direction;
};

const targetDirectories = (directories: PersistedDirectory[], directoryId: string) => (
  directoryId === "all" ? directories : directories.filter((directory) => directory.id === directoryId)
);

const scannedFileToResult = (file: ScannedFile): ImageSearchResult | null => {
  const capability = getFileFormatCapability(file.extension);
  if (!capability?.canSearch) return null;
  const isVisual = capability.canAIIndex;
  return {
    id: `file:${file.file_path}`,
    resultKind: isVisual ? "visual" : "file",
    filePath: file.file_path,
    fileName: file.file_name,
    extension: file.extension,
    iconName: isVisual ? "skim-file" : capability.iconName,
    previewKind: capability.previewKind,
    fileSize: file.file_size,
    createdAt: file.created_at,
    modifiedAt: file.modified_at,
    imageWidth: 0,
    imageHeight: 0,
    caption: "",
    keywords: [],
    aiError: "",
    manualIndex: false,
    failureType: "pending",
    failureLabel: isVisual ? t("recognition.pending") : "",
    indexedAt: "",
    thumbnailUrl: isVisual ? toThumbnailUrl(file.file_path) : ""
  };
};

const mergeScannedMetadata = (existing: ImageSearchResult, file: ScannedFile): ImageSearchResult => ({
  ...existing,
  filePath: file.file_path,
  fileName: file.file_name,
  extension: file.extension,
  fileSize: file.file_size,
  createdAt: file.created_at,
  modifiedAt: file.modified_at
});

type ImageSearchWithFormatsResponse = ImageSearchResponse & { availableFormats: string[] };

const emptyScanResult = (): ImageScanResult => ({
  scannedAt: new Date().toISOString(),
  directories: [],
  files: [],
  images: [],
  summaries: []
});

const getSearchScanResult = async (
  directories: PersistedDirectory[],
  control?: ImageScanControl
) => {
  try {
    return await searchScanSnapshotService.get(directories, () => control?.isCancelled() === true);
  } catch (error) {
    if (control?.isCancelled()) throw error;
    if ((error as NodeJS.ErrnoException)?.code === "ECANCELED") return emptyScanResult();
    throw error;
  }
};

export const searchImagesWithAddedDirectories = async (
  search: ImageSearchState,
  directories: PersistedDirectory[],
  onScannedImages?: (images: ScannedImageFile[]) => void,
  control?: ImageScanControl
): Promise<ImageSearchWithFormatsResponse> => {
  const directoriesToScan = targetDirectories(directories, search.directoryId);
  const [indexed, scanResult] = await Promise.all([
    searchIndexedCatalog(search, directories),
    getSearchScanResult(directoriesToScan, control)
  ]);
  if (control?.isCancelled()) {
    throw Object.assign(new Error("Image search cancelled."), { code: "ECANCELED" });
  }

  onScannedImages?.(scanResult.images);
  const terms = toSearchTerms(search.query);
  const includedExtensions = getIncludedExtensionSet(search.includedExtensions);
  const directoryTermMatches = getDirectoryTermMatches(directoriesToScan, terms);
  const selectedFileFormat = normalizeFileFormat(search.fileFormat);
  const knownCatalogVisualPaths = new Set(indexed.knownCatalogVisualFilePaths.map(filePathKey));
  const knownVisualPaths = new Set(indexed.knownVisualFilePaths.map(filePathKey));
  const scannedPathKeysByDirectory = new Map<string, Set<string>>();
  for (const file of scanResult.files) {
    const paths = scannedPathKeysByDirectory.get(file.directory_id) ?? new Set<string>();
    paths.add(filePathKey(file.file_path));
    scannedPathKeysByDirectory.set(file.directory_id, paths);
  }
  const scanStatusByDirectory = new Map(
    scanResult.directories.map((directory) => [directory.directory_id, directory.status])
  );

  const resultByPath = new Map<string, ImageSearchResult>();
  for (const result of indexed.images) {
    const directoryId = indexed.directoryIdByFilePath[result.filePath];
    const scanStatus = directoryId ? scanStatusByDirectory.get(directoryId) : undefined;
    if (
      (scanStatus === "ready" || scanStatus === "missing")
      && !scannedPathKeysByDirectory.get(directoryId)?.has(filePathKey(result.filePath))
    ) {
      continue;
    }
    resultByPath.set(filePathKey(result.filePath), result);
  }

  const availableFormatFiles = (search.recognitionStatus === "all" ? scanResult.files : scanResult.images)
    .filter((file) => !includedExtensions || includedExtensions.has(path.extname(file.file_name).toLowerCase()));
  const availableFormats = Array.from(new Set(
    availableFormatFiles.map((file) => getFileFormat(file.file_name)).filter(Boolean)
  )).sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));

  const newUnrecognizedVisualPaths = new Set<string>();
  for (const file of scanResult.files) {
    const capability = getFileFormatCapability(file.extension);
    if (!capability?.canSearch) continue;
    if (includedExtensions && !includedExtensions.has(file.extension)) continue;
    const fileFormat = getFileFormat(file.file_name);
    if (selectedFileFormat !== "all" && fileFormat !== selectedFileFormat) continue;
    if (!fileMatchesDeterministicSearchTerms(file, terms, directoryTermMatches)) continue;

    const key = filePathKey(file.file_path);
    const existing = resultByPath.get(key);
    if (existing) {
      resultByPath.set(key, mergeScannedMetadata(existing, file));
      continue;
    }

    if (capability.canAIIndex) {
      if (!knownCatalogVisualPaths.has(key)) newUnrecognizedVisualPaths.add(key);
      if (search.recognitionStatus === "recognized" || knownVisualPaths.has(key)) continue;
    } else if (search.recognitionStatus !== "all") {
      continue;
    }

    const result = scannedFileToResult(file);
    if (result) resultByPath.set(key, result);
  }

  const unrecognizedCount = indexed.unrecognizedCount + newUnrecognizedVisualPaths.size;
  return {
    images: [...resultByPath.values()].sort(compareImages(search)),
    availableFormats: availableFormats.length > 0 ? availableFormats : indexed.availableFormats,
    unrecognizedCount,
    skippedUnrecognizedCount: terms.length > 0 && search.recognitionStatus !== "unrecognized" ? unrecognizedCount : 0,
    failureStats: indexed.failureStats
  };
};
