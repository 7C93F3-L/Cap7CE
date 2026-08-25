export interface FileSourceRevisionInput {
  fileSize: number;
  modifiedAt: string;
}

export const createFileSourceRevision = ({ fileSize, modifiedAt }: FileSourceRevisionInput) => {
  const normalizedFileSize = Number.isFinite(fileSize) ? Math.max(0, Math.trunc(fileSize)) : 0;
  const modifiedMs = Date.parse(modifiedAt);
  const normalizedModifiedAt = Number.isFinite(modifiedMs) ? String(modifiedMs) : modifiedAt.trim();
  return `v1:${normalizedFileSize}:${normalizedModifiedAt}`;
};

export const appendFileSourceRevision = (url: string, source: FileSourceRevisionInput) => {
  if (!url) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}sourceRevision=${encodeURIComponent(createFileSourceRevision(source))}`;
};
