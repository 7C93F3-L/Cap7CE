import type { MetadataDirectoryStorageError } from "../src/shared/metadataBuildTypes";

const codes = new Set(["EACCES", "EPERM", "EBUSY", "ENOSPC", "EDQUOT", "EIO", "ENOENT", "ENOTDIR", "EISDIR", "EMFILE", "ENFILE",
  "EINVAL", "EXDEV", "EEXIST", "ENOTEMPTY", "ENAMETOOLONG", "EROFS", "ENODEV", "EFBIG", "ENOMEM", "EBADF", "EAGAIN"]);
export class MetadataDirectoryStoreError extends Error {
  readonly details: MetadataDirectoryStorageError;
  readonly cause: unknown;
  constructor(cause: unknown, operation: MetadataDirectoryStorageError["operation"]) {
    super("metadata-directory-state-unavailable"); this.cause = cause;
    const error = cause as NodeJS.ErrnoException | null;
    this.details = { operation, code: codes.has(error?.code ?? "") ? error!.code!
      : error instanceof SyntaxError || error?.message === "metadata-directory-invalid-state" ? "INVALID_STATE" : "UNKNOWN" };
  }
}

// Preserve the original cause internally; only bounded operation/code data reaches UI and diagnostics.
export function directoryStoreError(cause: unknown, operation: MetadataDirectoryStorageError["operation"],
  report?: (details: MetadataDirectoryStorageError) => void) {
  const error = cause instanceof MetadataDirectoryStoreError ? cause : new MetadataDirectoryStoreError(cause, operation);
  try { report?.({ ...error.details }); } catch { /* Logging must not replace the storage failure. */ }
  return error;
}
