import { nativeImage, type NativeImage } from "electron";
import {
  createVisualCacheEntry,
  initializeVisualCacheDirectories,
  isVisualCacheEntryValid,
  writeVisualCacheEntry
} from "./visualCacheService";
import type { VisualCacheType } from "./visualCacheService";

interface ShellThumbnailImage {
  isEmpty: () => boolean;
  toPNG: () => Buffer;
}

export interface ShellThumbnailProviderOptions {
  createThumbnail?: (sourcePath: string, size: { width: number; height: number }) => Promise<ShellThumbnailImage>;
  timeoutMs?: number;
  edge?: number;
  cacheType?: Extract<
    VisualCacheType,
    "skim-shell-thumbnail" | "skim-shell-preview" | "search-shell-thumbnail" | "search-shell-preview"
  >;
}

export interface ShellThumbnailProvider {
  ensureThumbnailPath: (sourcePath: string) => Promise<string>;
}

const shellThumbnailEdge = 300;
const shellPreviewEdge = 1200;
const defaultTimeoutMs = 15_000;

const timeoutError = (timeoutMs: number) => Object.assign(
  new Error(`Shell 缩略图请求在 ${timeoutMs} ms 后超时。`),
  { code: "ETIMEDOUT" }
);

const loadWithTimeout = async (
  createThumbnail: NonNullable<ShellThumbnailProviderOptions["createThumbnail"]>,
  sourcePath: string,
  edge: number,
  timeoutMs: number
) => {
  let timer: NodeJS.Timeout | null = null;
  const thumbnailPromise = Promise.resolve().then(() => createThumbnail(sourcePath, {
    width: edge,
    height: edge
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
  const edge = options.edge ?? shellThumbnailEdge;
  const cacheType = options.cacheType ?? "skim-shell-thumbnail";
  const pendingRequests = new Map<string, Promise<string>>();

  const ensureThumbnailPath = async (sourcePath: string) => {
    await initializeVisualCacheDirectories();
    const entry = await createVisualCacheEntry(sourcePath, cacheType);
    if (await isVisualCacheEntryValid(entry)) {
      return entry.imagePath;
    }

    const pending = pendingRequests.get(entry.key);
    if (pending) return pending;

    const request = (async () => {
      const image = await loadWithTimeout(createThumbnail, entry.sourcePath, edge, timeoutMs);
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

const defaultShellPreviewProvider = createShellThumbnailProvider({
  edge: shellPreviewEdge,
  cacheType: "skim-shell-preview"
});

export const ensureSkimShellPreviewPath = (sourcePath: string) => (
  defaultShellPreviewProvider.ensureThumbnailPath(sourcePath)
);

const defaultSearchShellThumbnailProvider = createShellThumbnailProvider({
  edge: shellThumbnailEdge,
  cacheType: "search-shell-thumbnail"
});

const defaultSearchShellPreviewProvider = createShellThumbnailProvider({
  edge: shellPreviewEdge,
  cacheType: "search-shell-preview"
});

export const ensureSearchShellThumbnailPath = (sourcePath: string) => (
  defaultSearchShellThumbnailProvider.ensureThumbnailPath(sourcePath)
);

export const ensureSearchShellPreviewPath = (sourcePath: string) => (
  defaultSearchShellPreviewProvider.ensureThumbnailPath(sourcePath)
);
