import path from "node:path";
import type { RuntimeDiagnostics } from "./runtimeDiagnostics";
import { cachedThumbnailFailureCode, ThumbnailFailureLogPolicy } from "./thumbnailFailurePolicy";

const logPolicy = new ThumbnailFailureLogPolicy();

export const createThumbnailFailureResponse = (
  filePath: string,
  error: unknown,
  runtimeDiagnostics: RuntimeDiagnostics
) => {
  const code = (error as NodeJS.ErrnoException).code;
  const status = code === "ENOENT" ? 404 : code === "ECANCELED" ? 499 : 500;
  const message = error instanceof Error ? error.message : "Thumbnail unavailable";

  if (code !== "ECANCELED" && code !== cachedThumbnailFailureCode) {
    const decision = logPolicy.record();
    if (decision === "detail") {
      console.warn("[thumbnail] failed", { filePath, status, message });
      runtimeDiagnostics.log("warn", "thumbnail.failed", {
        extension: path.extname(filePath).toLowerCase(),
        status,
        code,
        error
      });
    } else if (decision === "storm") {
      runtimeDiagnostics.log("warn", "thumbnail.failure_storm", {
        windowMs: logPolicy.windowMs,
        detailLimit: logPolicy.detailLimit
      });
    }
  }
  return new Response(message, { status });
};
