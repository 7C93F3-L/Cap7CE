import { ensureSearchShellPreviewPath, ensureSearchShellThumbnailPath } from "./shellThumbnailProvider";
import { ShellThumbnailScheduler } from "./shellThumbnailScheduler";

const searchSessionId = "search-shell-visual";
const scheduler = new ShellThumbnailScheduler((sourcePath, kind) => (
  kind === "preview"
    ? ensureSearchShellPreviewPath(sourcePath)
    : ensureSearchShellThumbnailPath(sourcePath)
));

scheduler.beginSession(searchSessionId);

export const requestSearchShellThumbnailCache = (sourcePath: string) => (
  scheduler.request(searchSessionId, sourcePath)
);

export const requestSearchShellPreviewCache = (sourcePath: string) => (
  scheduler.request(searchSessionId, sourcePath, "preview")
);

export const setSearchShellVisualActivity = (active: boolean) => {
  scheduler.setActive(active);
};

export const pauseSearchShellVisualCacheForClear = async () => {
  await scheduler.clear();
};

export const resumeSearchShellVisualCacheAfterClear = () => {
  scheduler.beginSession(searchSessionId);
};
