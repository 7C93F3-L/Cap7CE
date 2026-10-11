import type { ComputerSearchRuntime } from "./computerSearchRuntime";
import type { PreviewWindowData } from "./previewTypes";

export const authorizeComputerSearchPreviewData = (
  data: PreviewWindowData,
  runtime: ComputerSearchRuntime
): PreviewWindowData | null => {
  if (data?.sourceAuthorization?.kind !== "computer-search") return data;
  const authorizedItem = runtime.resolveAuthorizedItem(data.sourceAuthorization);
  if (!authorizedItem) return null;
  const task = encodeURIComponent(data.sourceAuthorization.taskId);
  const authorization = encodeURIComponent(data.sourceAuthorization.authorizationId);
  const canonicalPath = authorizedItem.path;
  return {
    ...data,
    itemId: authorizedItem.authorizationId,
    filePath: canonicalPath,
    fileName: authorizedItem.name,
    provider: authorizedItem.isDirectory ? "folderInfo" : data.provider,
    info: data.info ? {
      ...data.info,
      kind: authorizedItem.isDirectory ? "folder" : "file",
      name: authorizedItem.name,
      path: canonicalPath,
      extension: authorizedItem.isDirectory ? "" : authorizedItem.extension
    } : data.info,
    previewUrl: data.provider === "image"
      ? `cap7ce://computer-search-preview/?task=${task}&authorization=${authorization}`
      : data.provider === "audio" || data.provider === "video"
        ? `cap7ce://skim-media/?path=${encodeURIComponent(canonicalPath)}`
        : "",
    thumbnailUrl: data.provider === "image"
      ? `cap7ce://computer-search-preview-thumbnail/?task=${task}&authorization=${authorization}`
      : ""
  };
};
