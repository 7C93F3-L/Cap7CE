const path = require("node:path");
const { app, BrowserWindow, ipcMain, screen } = require("electron");

const probeTitlebarHeight = 36;
const probeThemes = {
  dark: { background: "#171717", foreground: "#D8D8D8", muted: "#8B8B8B", surface: "#242424", accent: "#7C93F3" },
  light: { background: "#F4F4F4", foreground: "#242424", muted: "#727272", surface: "#FFFFFF", accent: "#6078E8" }
};

let probeWindow = null;
let activeTheme = "dark";

const getTitleBarOverlay = (theme) => ({
  color: probeThemes[theme].background,
  symbolColor: probeThemes[theme].foreground,
  height: probeTitlebarHeight
});

const getProbeMetrics = () => {
  if (!probeWindow || probeWindow.isDestroyed()) return null;
  const bounds = probeWindow.getBounds();
  const contentBounds = probeWindow.getContentBounds();
  const display = screen.getDisplayMatching(bounds);
  return {
    theme: activeTheme,
    bounds,
    contentBounds,
    display: { id: display.id, bounds: display.bounds, workArea: display.workArea, scaleFactor: display.scaleFactor },
    maximized: probeWindow.isMaximized(),
    titlebarHeight: probeTitlebarHeight,
    versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node }
  };
};

const renderProbeHtml = () => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cap7CE WCO Probe</title>
  <style>
    :root { color-scheme: dark; --bg:${probeThemes.dark.background}; --fg:${probeThemes.dark.foreground}; --muted:${probeThemes.dark.muted}; --surface:${probeThemes.dark.surface}; --accent:${probeThemes.dark.accent}; }
    :root[data-theme="light"] { color-scheme:light; --bg:${probeThemes.light.background}; --fg:${probeThemes.light.foreground}; --muted:${probeThemes.light.muted}; --surface:${probeThemes.light.surface}; --accent:${probeThemes.light.accent}; }
    * { box-sizing:border-box; }
    html, body { width:100%; height:100%; margin:0; overflow:hidden; }
    body { background:var(--bg); color:var(--fg); font:12px/1.5 "Segoe UI", "Microsoft YaHei UI", sans-serif; }
    .titlebar { position:fixed; left:env(titlebar-area-x, 0px); top:env(titlebar-area-y, 0px); width:env(titlebar-area-width, 100%); height:env(titlebar-area-height, ${probeTitlebarHeight}px); z-index:10; display:flex; align-items:center; gap:6px; padding-left:10px; background:var(--bg); -webkit-app-region:drag; app-region:drag; }
    .titlebar strong { font-weight:600; }
    .titlebar small { color:var(--muted); }
    button { border:0; color:inherit; font:inherit; -webkit-app-region:no-drag; app-region:no-drag; }
    .pin { width:36px; height:30px; margin-left:auto; display:grid; place-items:center; border-radius:8px; background:transparent; color:var(--muted); cursor:pointer; }
    .pin:hover { color:var(--fg); background:var(--surface); }
    .pin[aria-pressed="true"] { color:var(--accent); }
    main { height:100%; padding:calc(env(titlebar-area-height, ${probeTitlebarHeight}px) + 12px) 12px 12px; }
    .panel { height:100%; overflow:auto; border:1px solid color-mix(in srgb, var(--fg) 14%, transparent); border-radius:14px; padding:14px; background:var(--surface); -webkit-app-region:no-drag; app-region:no-drag; }
    .actions { display:flex; gap:8px; margin:10px 0; }
    .actions button { padding:5px 10px; border-radius:999px; background:color-mix(in srgb, var(--fg) 10%, var(--surface)); cursor:pointer; }
    pre { margin:10px 0 0; white-space:pre-wrap; color:var(--muted); }
  </style>
</head>
<body>
  <header class="titlebar">
    <strong>Cap7CE WCO Probe</strong>
    <small>拖动这里，并测试系统按钮与 Snap</small>
    <button class="pin" id="pin" type="button" aria-label="置顶视觉探针" aria-pressed="false" title="复用置顶按钮位置">●</button>
  </header>
  <main>
    <section class="panel">
      <strong>独立兼容标题栏能力探针</strong>
      <div class="actions"><button id="theme" type="button">切换明暗</button><button id="refresh" type="button">刷新数据</button></div>
      <div>检查：系统最小化 / 最大化 / 关闭、最大化悬停 Snap、标题栏拖动、圆角、高 DPI 和跨屏。</div>
      <pre id="metrics">读取中…</pre>
    </section>
  </main>
  <script>
    const metrics = document.getElementById("metrics");
    const pin = document.getElementById("pin");
    const refresh = async () => {
      const overlay = navigator.windowControlsOverlay;
      const overlayRect = overlay?.getTitlebarAreaRect?.();
      const mainMetrics = await window.cap7ceWindowProbe.getWindowMetrics();
      metrics.textContent = JSON.stringify({
        windowControlsOverlay: { supported:Boolean(overlay), visible:overlay?.visible ?? false, rect:overlayRect ? { x:overlayRect.x, y:overlayRect.y, width:overlayRect.width, height:overlayRect.height } : null },
        renderer: { innerWidth:window.innerWidth, innerHeight:window.innerHeight, devicePixelRatio:window.devicePixelRatio },
        main:mainMetrics
      }, null, 2);
    };
    document.getElementById("theme").addEventListener("click", async () => {
      const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      const result = await window.cap7ceWindowProbe.setTheme(nextTheme);
      document.documentElement.dataset.theme = result.theme === "light" ? "light" : "dark";
      await refresh();
    });
    document.getElementById("refresh").addEventListener("click", refresh);
    pin.addEventListener("click", () => pin.setAttribute("aria-pressed", pin.getAttribute("aria-pressed") === "true" ? "false" : "true"));
    navigator.windowControlsOverlay?.addEventListener?.("geometrychange", refresh);
    window.addEventListener("resize", refresh);
    refresh();
  </script>
</body>
</html>`;

const createProbeWindow = () => {
  probeWindow = new BrowserWindow({
    width: 420,
    height: 300 + probeTitlebarHeight,
    minWidth: 300,
    minHeight: 156 + probeTitlebarHeight,
    title: "Cap7CE WCO Probe",
    transparent: false,
    backgroundColor: probeThemes.dark.background,
    roundedCorners: true,
    titleBarStyle: "hidden",
    titleBarOverlay: getTitleBarOverlay(activeTheme),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "window-controls-overlay-probe-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false
    }
  });
  probeWindow.setMenuBarVisibility(false);
  probeWindow.once("ready-to-show", () => {
    probeWindow?.show();
    console.log(JSON.stringify(getProbeMetrics(), null, 2));
  });
  probeWindow.on("closed", () => { probeWindow = null; });
  void probeWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderProbeHtml())}`);
};

ipcMain.handle("window-controls-overlay-probe:get-metrics", (event) => {
  if (!probeWindow || event.sender !== probeWindow.webContents) return null;
  return getProbeMetrics();
});

ipcMain.handle("window-controls-overlay-probe:set-theme", (event, theme) => {
  if (!probeWindow || event.sender !== probeWindow.webContents) return { theme: activeTheme };
  if (theme !== "dark" && theme !== "light") return { theme: activeTheme };
  activeTheme = theme;
  probeWindow.setBackgroundColor(probeThemes[theme].background);
  probeWindow.setTitleBarOverlay(getTitleBarOverlay(theme));
  return { theme: activeTheme };
});

app.whenReady().then(createProbeWindow).catch((error) => {
  console.error(error);
  app.exit(1);
});

app.on("window-all-closed", () => app.quit());
