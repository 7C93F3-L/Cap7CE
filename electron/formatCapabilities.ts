export type FileFormatCategory = "visual" | "text" | "document" | "data" | "archive" | "audio" | "video" | "font" | "threeD" | "project";
export type FilePreviewKind = "image" | "fileInfo" | "text" | "audio" | "video" | "pdf" | "office" | "archive";

export interface FileFormatCapability {
  extension: string;
  category: FileFormatCategory;
  iconName: string;
  canBrowse: boolean;
  defaultInSkim: boolean;
  canIndex: boolean;
  canSearch: boolean;
  canThumbnail: boolean;
  previewKind: FilePreviewKind;
  canDirectPreview: boolean;
  canAIIndex: boolean;
}

const visualExtensions = [
  ".jpg", ".jpeg", ".png", ".webp", ".avif", ".bmp", ".tif", ".tiff", ".gif",
  ".svg", ".pdf", ".psd", ".ai", ".eps", ".cdr"
] as const;
const directPreviewExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"]);

const nonVisualFormatGroups: ReadonlyArray<readonly [FileFormatCategory, readonly string[]]> = [
  ["text", ["txt", "md", "rtf", "html", "ini"]],
  ["data", ["csv", "json", "xml", "yaml", "yml"]],
  ["document", ["doc", "docx", "xls", "xlsx", "ppt", "pptx"]],
  ["archive", ["7z", "gz", "rar", "tar", "zip"]],
  ["audio", ["aac", "flac", "m4a", "mp3", "ogg", "wav"]],
  ["video", ["avi", "m4v", "mkv", "mov", "mp4", "webm"]],
  ["font", ["otf", "ttf", "woff", "woff2"]],
  ["threeD", ["3ds", "c4d", "dwg", "dxf", "fbx", "glb", "gltf", "iges", "igs", "max", "obj", "skp", "step", "stl", "stp"]],
  ["project", ["aep", "bip", "blend", "drp", "ksp", "prproj", "pproj", "veg"]]
];

const browseOnlyFormatGroups: ReadonlyArray<readonly [FileFormatCategory, readonly string[]]> = [
  ["visual", ["heic", "heif", "jfif", "psb", "tga", "exr", "hdr", "dng", "cr2", "cr3", "nef", "arw", "raf", "orf", "rw2"]],
  ["video", ["wmv", "mpg", "mpeg", "mts", "m2ts", "mxf", "flv", "rmvb", "3gp"]],
  ["audio", ["wma", "opus", "aif", "aiff", "ape"]],
  ["document", ["odt", "ods", "odp", "epub", "wps", "et", "dps", "one", "xps", "oxps"]]
];

const skimDefaultHiddenExtensions = new Set([
  "rtf", "html", "ini", "csv", "json", "xml", "yaml", "yml", "gz", "tar", "woff", "woff2"
]);

const iconNameByExtension = new Map<string, string>([
  ["blend", "format-blend"],
  ["prproj", "format-prproj"],
  ["pproj", "format-prproj"]
]);

const contentPreviewKinds = new Map<string, FilePreviewKind>([
  ["txt", "text"], ["md", "text"], ["ini", "text"], ["html", "text"],
  ["csv", "text"], ["json", "text"], ["xml", "text"], ["yaml", "text"], ["yml", "text"],
  ["doc", "text"], ["docx", "text"],
  ["xls", "office"], ["xlsx", "office"], ["ppt", "office"], ["pptx", "office"],
  ["7z", "archive"], ["rar", "archive"], ["zip", "archive"],
  ["flac", "audio"], ["m4a", "audio"], ["mp3", "audio"], ["ogg", "audio"], ["wav", "audio"],
  ["mkv", "video"], ["mp4", "video"], ["mov", "video"], ["webm", "video"]
]);

const visualCapabilities = visualExtensions.map((extension): FileFormatCapability => ({
  extension,
  category: "visual",
  iconName: "skim-file",
  canBrowse: true,
  defaultInSkim: true,
  canIndex: true,
  canSearch: true,
  canThumbnail: true,
  previewKind: extension === ".pdf" ? "pdf" : "image",
  canDirectPreview: directPreviewExtensions.has(extension),
  canAIIndex: true
}));

const nonVisualCapabilities = nonVisualFormatGroups.flatMap(([category, extensions]) => (
  extensions.map((extension): FileFormatCapability => ({
    extension: `.${extension}`,
    category,
    iconName: iconNameByExtension.get(extension) ?? `format-${extension}`,
    canBrowse: true,
    defaultInSkim: !skimDefaultHiddenExtensions.has(extension),
    canIndex: true,
    canSearch: true,
    canThumbnail: false,
    previewKind: contentPreviewKinds.get(extension) ?? "fileInfo",
    canDirectPreview: false,
    canAIIndex: false
  }))
));

const browseOnlyCapabilities = browseOnlyFormatGroups.flatMap(([category, extensions]) => (
  extensions.map((extension): FileFormatCapability => ({
    extension: `.${extension}`,
    category,
    iconName: "skim-file",
    canBrowse: true,
    defaultInSkim: true,
    canIndex: false,
    canSearch: false,
    canThumbnail: false,
    previewKind: "fileInfo",
    canDirectPreview: false,
    canAIIndex: false
  }))
));

export const fileFormatCapabilities: readonly FileFormatCapability[] = [
  ...visualCapabilities,
  ...nonVisualCapabilities,
  ...browseOnlyCapabilities
];

export const fileFormatCapabilityByExtension: ReadonlyMap<string, FileFormatCapability> = new Map(
  fileFormatCapabilities.map((capability) => [capability.extension, capability])
);

export const skimCuratedFileExtensionSet: ReadonlySet<string> = new Set(
  fileFormatCapabilities.filter((capability) => capability.canBrowse).map((capability) => capability.extension)
);

export const skimDefaultFileExtensionSet: ReadonlySet<string> = new Set(
  fileFormatCapabilities.filter((capability) => capability.canBrowse && capability.defaultInSkim).map((capability) => capability.extension)
);

export const indexableFileExtensionSet: ReadonlySet<string> = new Set(
  fileFormatCapabilities.filter((capability) => capability.canIndex).map((capability) => capability.extension)
);

export const getFileFormatCapability = (extension: string) => (
  fileFormatCapabilityByExtension.get(extension.toLowerCase())
);
