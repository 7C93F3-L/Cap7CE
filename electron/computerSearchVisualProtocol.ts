import type { ComputerSearchRuntime } from "./computerSearchRuntime";
import type { SkimVisualRequestKind } from "./skimVisualCacheService";

interface ComputerSearchVisualProtocolDependencies {
  runtime: ComputerSearchRuntime;
  requestVisualCache: (sessionId: string, sourcePath: string, kind: SkimVisualRequestKind) => Promise<string>;
  requestShellThumbnailCache: (sessionId: string, sourcePath: string) => Promise<string>;
  requestShellPreviewCache: (sessionId: string, sourcePath: string) => Promise<string>;
  shouldUseSourceFileForPreview: (sourcePath: string) => Promise<boolean>;
  fetchSourceFile: (sourcePath: string) => Promise<Response>;
  readVisualCacheImage: (cachePath: string) => Promise<{ buffer: Buffer; mimeType: string }>;
}

export const isComputerSearchVisualHost = (hostname: string) => (
  hostname === "computer-search-thumbnail" || hostname === "computer-search-preview"
);

export const handleComputerSearchVisualRequest = async (
  url: URL,
  dependencies: ComputerSearchVisualProtocolDependencies
): Promise<Response | null> => {
  if (!isComputerSearchVisualHost(url.hostname)) return null;
  const taskId = url.searchParams.get("task") ?? "";
  const authorizationId = url.searchParams.get("authorization") ?? "";
  const item = dependencies.runtime.resolveAuthorizedItem({ taskId, authorizationId });
  const sessionId = dependencies.runtime.getVisualSessionId(taskId);
  const preview = url.hostname === "computer-search-preview";
  if (!item || !sessionId || (preview && item.isDirectory)) {
    return new Response("Computer search visual request is unavailable", { status: 403 });
  }
  try {
    const cachePath = preview && item.canShellPreview
      ? await dependencies.requestShellPreviewCache(sessionId, item.path)
      : !preview && (!item.canThumbnail || item.isDirectory)
        ? await dependencies.requestShellThumbnailCache(sessionId, item.path)
        : await dependencies.requestVisualCache(sessionId, item.path, preview ? "preview" : "thumbnail");
    if (preview && await dependencies.shouldUseSourceFileForPreview(item.path)) {
      return dependencies.fetchSourceFile(item.path);
    }
    const image = await dependencies.readVisualCacheImage(cachePath);
    const body = image.buffer.buffer.slice(
      image.buffer.byteOffset,
      image.buffer.byteOffset + image.buffer.byteLength
    ) as ArrayBuffer;
    return new Response(body, {
      headers: { "Content-Type": image.mimeType, "Cache-Control": "no-store" }
    });
  } catch {
    return new Response("Computer search visual request is unavailable", { status: 404 });
  }
};
