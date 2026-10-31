import { renderEpsEmbeddedPreview as render } from "../core/artifacts/file-facts/core/node/visualRendering/shell/vectorDocumentRenderService";
import { requestCoreShellThumbnail } from "./core/coreShellThumbnail";
export { assertPdfCompatibleIllustratorFile } from "../core/artifacts/file-facts/core/node/visualRendering/shell/vectorDocumentRenderService";
// Keep the old resource default; the canonical renderer retains temporary-file ownership.
export const renderEpsEmbeddedPreview = (sourcePath: string, maxWidth: number, maxHeight: number,
  thumbnail: (sourcePath: string, edge: number) => Promise<Buffer> = requestCoreShellThumbnail, temporaryDirectory?: string) =>
  render(sourcePath, maxWidth, maxHeight, thumbnail, temporaryDirectory);
