const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cap7ceWindowProbe", {
  getWindowMetrics: () => ipcRenderer.invoke("window-controls-overlay-probe:get-metrics"),
  setTheme: (theme) => ipcRenderer.invoke("window-controls-overlay-probe:set-theme", theme)
});
