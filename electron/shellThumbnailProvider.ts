import { nativeImage, type NativeImage } from "electron";
import {
  createVisualCacheEntry,
  initializeVisualCacheDirectories,
  isVisualCacheEntryValid,
  writeVisualCacheEntry
} from "./visualCacheService";

interface ShellThumbnailImage {
  isEmpty: () => boolean;
  toPNG: () => Buffer;
}

export interface ShellThumbnailProviderOptions {
  createThumbnail?: (sourcePath: string, size: { width: number; height: number }) => Promise<ShellThumbnailImage>;
  timeoutMs?: number;
}

export interface ShellThumbnailProvider {
  ensureThumbnailPath: (sourcePath: string) => Promise<string>;
}

const shellThumbnailEdge = 300;
const defaultTimeoutMs = 15_000;

const timeoutError = (timeoutMs: number) => Object.assign(
  new Error(`Shell 缩略图请求在 ${timeoutMs} ms 后超时。`),
  { code: "ETIMEDOUT" }
);

const loadWithTimeout = async (
  createThumbnail: NonNullable<ShellThumbnailProviderOptions["createThumbnail"]>,
  sourcePath: string,
  timeoutMs: number
) => {
  let timer: NodeJS.Timeout | null = null;
  const thumbnailPromise = Promise.resolve().then(() => createThumbnail(sourcePath, {
    width: shellThumbnailEdge,
    height: shellThumbnailEdge
  }));
  thumbnailPromise.catch(() => undefined);
  try {
    return await Promise.race([
      thumbnailPromise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(timeoutError(timeoutMs)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const defaultCreateThumbnail = (sourcePath: string, size: { width: number; height: number }): Promise<NativeImage> => (
  nativeImage.createThumbnailFromPath(sourcePath, size)
);

export const createShellThumbnailProvider = (
  options: ShellThumbnailProviderOptions = {}
): ShellThumbnailProvider => {
  const createThumbnail = options.createThumbnail ?? defaultCreateThumbnail;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const pendingRequests = new Map<string, Promise<string>>();

  const ensureThumbnailPath = async (sourcePath: string) => {
    await initializeVisualCacheDirectories();
    const entry = await createVisualCacheEntry(sourcePath, "skim-shell-thumbnail");
    if (await isVisualCacheEntryValid(entry)) {
      return entry.imagePath;
    }

    const pending = pendingRequests.get(entry.key);
    if (pending) return pending;

    const request = (async () => {
      const image = await loadWithTimeout(createThumbnail, entry.sourcePath, timeoutMs);
      if (image.isEmpty()) {
        throw new Error("Windows Shell 未返回内容缩略图。");
      }
      const png = image.toPNG();
      if (png.length === 0) {
        throw new Error("Windows Shell 缩略图编码为空。");
      }
      await writeVisualCacheEntry(entry, png, "image/png");
      return entry.imagePath;
    })().finally(() => {
      pendingRequests.delete(entry.key);
    });
    pendingRequests.set(entry.key, request);
    return request;
  };

  return { ensureThumbnailPath };
};

const defaultShellThumbnailProvider = createShellThumbnailProvider();

export const ensureSkimShellThumbnailPath = (sourcePath: string) => (
  defaultShellThumbnailProvider.ensureThumbnailPath(sourcePath)
);
