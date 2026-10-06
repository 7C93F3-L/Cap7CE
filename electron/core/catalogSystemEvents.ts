import type { BrowserWindow, PowerMonitor } from "electron";

// OS events request the existing discovery/synchronization owner. A burst is
// coalesced; no idle polling or automatic retry of failed connections occurs.
export const installCatalogSystemEvents = (window: Pick<BrowserWindow,
  "hookWindowMessage" | "unhookWindowMessage" | "isDestroyed" | "once">,
  power: Pick<PowerMonitor, "on" | "off">, refresh: () => Promise<void>,
  platform = process.platform): (() => void) => {
  let stopped = false, pending = false, running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      while (!stopped && pending) {
        pending = false;
        try { await refresh(); } catch { /* A new OS event or user operation may retry. */ }
      }
    } finally { running = false; }
  };
  const notify = () => {
    if (stopped) return;
    pending = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; void run(); }, 350);
  };
  const message = (parameter: Buffer) => {
    if (parameter.length < 4) return;
    if ([0x8000, 0x8004, 0x0007].includes(parameter.readUInt32LE(0))) notify();
  };
  power.on("resume", notify);
  if (platform === "win32") window.hookWindowMessage(0x0219, message);
  const stop = () => {
    if (stopped) return;
    stopped = true; pending = false;
    if (timer) clearTimeout(timer);
    power.off("resume", notify);
    if (platform === "win32" && !window.isDestroyed()) window.unhookWindowMessage(0x0219);
  };
  window.once("closed", stop);
  return stop;
};
