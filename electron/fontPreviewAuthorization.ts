import path from "node:path";
export const isFontPreviewRequestAuthorized = (
  activePreview: { provider?: string; sessionId: string; filePath: string } | null,
  sessionId: string | null,
  filePath: string
) => {
  if (!activePreview || activePreview.provider !== "font" || !sessionId || activePreview.sessionId !== sessionId) return false;
  const requestedPath = path.normalize(path.resolve(filePath));
  const activePath = path.normalize(path.resolve(activePreview.filePath));
  return process.platform === "win32"
    ? requestedPath.toLowerCase() === activePath.toLowerCase()
    : requestedPath === activePath;
};
