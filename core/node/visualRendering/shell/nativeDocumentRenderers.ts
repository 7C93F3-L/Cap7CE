import path from "node:path";
import { requestCoreShellThumbnail } from "./coreShellThumbnail";
import { visualNativeExecutable } from "../resources";

const render = (source: string, target: { maxWidth: number; maxHeight: number }) => (
  requestCoreShellThumbnail(source, Math.max(target.maxWidth, target.maxHeight), visualNativeExecutable(),
    15000, path.extname(source).toLowerCase() === ".exr" ? "exr" : "pdf")
);

export const nativeDocumentSourceRenderers = { ".pdf": render, ".exr": render };
