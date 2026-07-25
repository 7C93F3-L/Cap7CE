import { app, nativeImage, type NativeImage, type WebContents } from "electron";
import fs from "node:fs";
import path from "node:path";
import { isCap7CECachePath } from "./visualCacheService";

const fallbackDragIconDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const normalizePathKey = (filePath: string) => (
  process.platform === "win32" ? filePath.toLowerCase() : filePath
);

export const validateNativeDragFilePaths = (filePaths: unknown): string[] => {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    throw new Error("没有可拖拽的源文件。");
  }

  const uniqueFilePaths = new Map<string, string>();
  for (const filePath of filePaths) {
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new Error("拖拽文件路径无效。");
    }

    const resolvedPath = path.resolve(filePath);
    if (isCap7CECachePath(resolvedPath)) {
      throw new Error("拒绝拖拽 Cap7CE 自身缓存文件。");
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolvedPath);
    } catch {
      throw new Error(`源文件不存在或无法访问：${resolvedPath}`);
    }
    if (!stat.isFile()) {
      throw new Error(`拖拽路径不是文件：${resolvedPath}`);
    }

    uniqueFilePaths.set(normalizePathKey(resolvedPath), resolvedPath);
  }

  const validatedPaths = [...uniqueFilePaths.values()];
  if (validatedPaths.length === 0) {
    throw new Error("没有可拖拽的源文件。");
  }
  return validatedPaths;
};

const createDragIcon = (filePath: string): NativeImage => {
  const sourceIcon = nativeImage.createFromPath(filePath);
  if (!sourceIcon.isEmpty()) {
    return sourceIcon.resize({
      width: 48,
      height: 48,
      quality: "good"
    });
  }

  const applicationIcon = nativeImage.createFromPath(
    path.join(app.getAppPath(), "build", "icon.ico")
  );
  return applicationIcon.isEmpty()
    ? nativeImage.createFromDataURL(fallbackDragIconDataUrl)
    : applicationIcon.resize({ width: 48, height: 48, quality: "good" });
};

export const startNativeFileDrag = (
  webContents: WebContents,
  filePaths: unknown
) => {
  const validatedPaths = validateNativeDragFilePaths(filePaths);
  webContents.startDrag({
    file: validatedPaths[0],
    files: validatedPaths,
    icon: createDragIcon(validatedPaths[0])
  });
};
