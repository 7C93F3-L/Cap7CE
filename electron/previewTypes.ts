export type PreviewNavigateDirection = -1 | 1;

export type PreviewItemAction = "editKeywords" | "deleteFile";

export interface PreviewItemActionRequest {
  action: PreviewItemAction;
  itemId: string;
  filePath: string;
}

export interface PreviewWindowData {
  sessionId: string;
  itemId: string;
  filePath: string;
  fileName: string;
  previewUrl: string;
  thumbnailUrl: string;
  provider?: "image" | "fileInfo" | "folderInfo" | "text" | "audio" | "video";
  info?: {
    kind: "file" | "folder";
    name: string;
    path: string;
    extension: string;
    size: number;
    modifiedAt: string;
    withinAddedDirectory: boolean;
  };
  textPreview?: {
    content: string;
    encoding: "utf-8" | "utf-16le" | "utf-16be";
    truncated: boolean;
  };
  theme: "light" | "dark";
  language: "zh-CN" | "en-US";
  appearanceColors: {
    themeColor: string;
    accentColor: string;
  };
}

export interface PreviewContentSize {
  sessionId: string;
  filePath: string;
  width: number;
  height: number;
}

export interface PreviewWindowControlState {
  isMaximized: boolean;
  isAlwaysOnTop: boolean;
  miniStandardHeight: number;
}
