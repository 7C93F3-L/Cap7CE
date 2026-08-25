let getMainWebContents: (() => Electron.WebContents | null) | null = null;
let notificationTimer: NodeJS.Timeout | null = null;

export const configureSearchIndexChangeRuntime = (getWebContents: () => Electron.WebContents | null) => {
  getMainWebContents = getWebContents;
};

export const notifySearchIndexChanged = () => {
  if (notificationTimer) return;
  notificationTimer = setTimeout(() => {
    notificationTimer = null;
    const webContents = getMainWebContents?.();
    if (webContents && !webContents.isDestroyed()) webContents.send("search:indexChanged");
  }, 150);
  notificationTimer.unref?.();
};
