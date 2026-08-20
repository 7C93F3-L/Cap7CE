export const getDirectoryPath = (filePath: string) => {
  const normalizedPath = filePath.replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(normalizedPath.lastIndexOf("\\"), normalizedPath.lastIndexOf("/"));
  if (separatorIndex < 0) return "";
  if (separatorIndex === 2 && /^[A-Za-z]:[\\/]/.test(normalizedPath)) return normalizedPath.slice(0, 3);
  return normalizedPath.slice(0, Math.max(1, separatorIndex));
};
