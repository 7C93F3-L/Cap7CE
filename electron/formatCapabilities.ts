export type FileFormatCategory = "visual" | "text" | "document" | "data" | "archive" | "audio" | "video" | "font" | "threeD" | "project";
export type FilePreviewKind = "image" | "fileInfo";

export interface FileFormatCapability {
  extension: string;
  category: FileFormatCategory;
  iconName: string;
  canBrowse: boolean;
  canIndex: boolean;
  canSearch: boolean;
  canThumbnail: boolean;
  previewKind: FilePreviewKind;
  canDirectPreview: boolean;
  canAIIndex: boolean;
}

const visualExtensions = [
  ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".gif",
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
  ["project", ["aep", "bip", "bld", "drp", "ksp", "pr", "veg"]]
];

const visualCapabilities = visualExtensions.map((extension): FileFormatCapability => ({
  extension,
  category: "visual",
  iconName: "skim-file",
  canBrowse: true,
  canIndex: true,
  canSearch: true,
  canThumbnail: true,
  previewKind: "image",
  canDirectPreview: directPreviewExtensions.has(extension),
  canAIIndex: true
}));

const nonVisualCapabilities = nonVisualFormatGroups.flatMap(([category, extensions]) => (
  extensions.map((extension): FileFormatCapability => ({
    extension: `.${extension}`,
    category,
    iconName: `format-${extension}`,
    canBrowse: true,
    canIndex: true,
    canSearch: false,
    canThumbnail: false,
    previewKind: "fileInfo",
    canDirectPreview: false,
    canAIIndex: false
  }))
));

export const fileFormatCapabilities: readonly FileFormatCapability[] = [
  ...visualCapabilities,
  ...nonVisualCapabilities
];

export const fileFormatCapabilityByExtension: ReadonlyMap<string, FileFormatCapability> = new Map(
  fileFormatCapabilities.map((capability) => [capability.extension, capability])
);

export const skimBrowsableFileExtensionSet: ReadonlySet<string> = new Set(
  fileFormatCapabilities.filter((capability) => capability.canBrowse).map((capability) => capability.extension)
);

export const indexableFileExtensionSet: ReadonlySet<string> = new Set(
  fileFormatCapabilities.filter((capability) => capability.canIndex).map((capability) => capability.extension)
);

export const getFileFormatCapability = (extension: string) => (
  fileFormatCapabilityByExtension.get(extension.toLowerCase())
);
