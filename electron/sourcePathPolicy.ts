import path from "node:path";
const normalizePathKey = (value: string) => {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};

export const isPathWithinDirectory = (candidatePath: string, directoryPath: string) => {
  const candidateKey = normalizePathKey(candidatePath);
  const directoryKey = normalizePathKey(directoryPath);
  const relativePath = path.relative(directoryKey, candidateKey);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
};
