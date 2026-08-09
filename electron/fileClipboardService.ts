import path from "node:path";

export const normalizeFilePathsForClipboard = (
  candidates: unknown,
  platform: NodeJS.Platform = process.platform
) => {
  if (!Array.isArray(candidates)) return [];
  const normalizedPaths = new Map<string, string>();
  for (const candidate of candidates.slice(0, 1_000)) {
    if (typeof candidate !== "string") continue;
    const trimmedPath = candidate.trim();
    if (!path.isAbsolute(trimmedPath)) continue;
    const normalizedPath = path.normalize(path.resolve(trimmedPath));
    const key = platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
    if (!normalizedPaths.has(key)) normalizedPaths.set(key, normalizedPath);
  }
  return [...normalizedPaths.values()];
};

export const formatFilePathsForClipboard = (candidates: unknown) => (
  normalizeFilePathsForClipboard(candidates).join("\r\n")
);
