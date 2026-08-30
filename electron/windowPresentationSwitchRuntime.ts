import { promises as fs } from "node:fs";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import { normalizeWindowPresentationMode, type WindowPresentationMode } from "./windowPresentationPolicy";

type SwitchPhase = "pending" | "launching" | "confirmed";

interface WindowPresentationSwitchMarker {
  version: 1;
  previousMode: WindowPresentationMode;
  targetMode: WindowPresentationMode;
  phase: SwitchPhase;
  updatedAt: string;
}

export type WindowPresentationSwitchResult = {
  status: "restarting" | "unchanged" | "busy" | "failed";
  targetMode: WindowPresentationMode;
};

interface WindowPresentationSwitchRuntimeOptions {
  registrar: IpcRegistrar;
  isSenderAllowed: (event: IpcMainInvokeEvent) => boolean;
  markerPath: string;
  getActiveMode: () => WindowPresentationMode;
  updatePreference: (mode: WindowPresentationMode) => Promise<{ windowPresentationMode: WindowPresentationMode }>;
  flushBeforeRestart: () => Promise<void>;
  relaunch: () => void;
  quit: () => void;
  setQuitting: () => void;
  startupTimeoutMs?: number;
  now?: () => Date;
  onDiagnostic?: (level: "info" | "warn" | "error", event: string, data: Record<string, unknown>) => void;
}

const isWindowPresentationMode = (value: unknown): value is WindowPresentationMode => (
  value === "cap7ce" || value === "compatibility"
);

const isSwitchMarker = (value: unknown): value is WindowPresentationSwitchMarker => {
  if (!value || typeof value !== "object") return false;
  const marker = value as Partial<WindowPresentationSwitchMarker>;
  return marker.version === 1
    && isWindowPresentationMode(marker.previousMode)
    && isWindowPresentationMode(marker.targetMode)
    && (marker.phase === "pending" || marker.phase === "launching" || marker.phase === "confirmed")
    && typeof marker.updatedAt === "string";
};

class WindowPresentationSwitchStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<WindowPresentationSwitchMarker | null> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8")) as unknown;
      if (isSwitchMarker(parsed)) return parsed;
      await this.clear();
      return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      if (error instanceof SyntaxError) {
        await this.clear();
        return null;
      }
      throw error;
    }
  }

  async write(marker: WindowPresentationSwitchMarker): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
    await fs.rm(this.filePath, { force: true });
    await fs.rename(temporaryPath, this.filePath);
  }

  async clear(): Promise<void> {
    await fs.rm(this.filePath, { force: true });
  }
}

export class WindowPresentationSwitchRuntime {
  private readonly store: WindowPresentationSwitchStore;
  private readonly startupTimeoutMs: number;
  private readonly now: () => Date;
  private switchInProgress = false;
  private startupMarker: WindowPresentationSwitchMarker | null = null;
  private startupTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: WindowPresentationSwitchRuntimeOptions) {
    this.store = new WindowPresentationSwitchStore(options.markerPath);
    this.startupTimeoutMs = options.startupTimeoutMs ?? 20_000;
    this.now = options.now ?? (() => new Date());
  }

  private marker(previousMode: WindowPresentationMode, targetMode: WindowPresentationMode, phase: SwitchPhase): WindowPresentationSwitchMarker {
    return { version: 1, previousMode, targetMode, phase, updatedAt: this.now().toISOString() };
  }

  private report(level: "info" | "warn" | "error", event: string, data: Record<string, unknown>): void {
    try {
      this.options.onDiagnostic?.(level, event, data);
    } catch {
      // Diagnostics must not change the restart transaction.
    }
  }

  private clearStartupTimer(): void {
    if (this.startupTimer === null) return;
    clearTimeout(this.startupTimer);
    this.startupTimer = null;
  }

  private scheduleQuit(): void {
    setTimeout(() => {
      this.options.setQuitting();
      this.options.quit();
    }, 120);
  }

  private async rollback(marker: WindowPresentationSwitchMarker): Promise<void> {
    await this.options.updatePreference(marker.previousMode);
    await this.store.clear();
  }

  private async restartAfterStartupFailure(): Promise<void> {
    const marker = this.startupMarker;
    if (!marker) return;
    this.clearStartupTimer();
    this.startupMarker = null;
    this.report("warn", "window.presentation.switch.startup_timeout", { previousMode: marker.previousMode, targetMode: marker.targetMode });
    try {
      await this.rollback(marker);
      this.options.relaunch();
      this.scheduleQuit();
    } catch (error) {
      this.report("error", "window.presentation.switch.startup_rollback_failed", { previousMode: marker.previousMode, targetMode: marker.targetMode, error });
      console.warn("[window-presentation-switch] startup rollback failed", error);
    }
  }

  async resolveStartupMode(preferredMode: WindowPresentationMode): Promise<WindowPresentationMode> {
    const normalizedPreferredMode = normalizeWindowPresentationMode(preferredMode);
    const marker = await this.store.read();
    if (!marker) return normalizedPreferredMode;
    if (marker.phase === "confirmed" || marker.targetMode !== normalizedPreferredMode) {
      await this.store.clear();
      return normalizedPreferredMode;
    }
    if (marker.phase === "launching") {
      await this.rollback(marker);
      this.report("warn", "window.presentation.switch.stale_launch_rolled_back", { previousMode: marker.previousMode, targetMode: marker.targetMode });
      return marker.previousMode;
    }
    this.startupMarker = this.marker(marker.previousMode, marker.targetMode, "launching");
    await this.store.write(this.startupMarker);
    this.report("info", "window.presentation.switch.startup_pending", { previousMode: marker.previousMode, targetMode: marker.targetMode });
    this.startupTimer = setTimeout(() => { void this.restartAfterStartupFailure(); }, this.startupTimeoutMs);
    return marker.targetMode;
  }

  async completeStartup(activeMode: WindowPresentationMode): Promise<void> {
    const marker = this.startupMarker;
    if (!marker || marker.targetMode !== activeMode) return;
    this.clearStartupTimer();
    this.startupMarker = null;
    try {
      await this.store.write(this.marker(marker.previousMode, marker.targetMode, "confirmed"));
    } catch (error) {
      this.report("error", "window.presentation.switch.confirmation_write_failed", { previousMode: marker.previousMode, targetMode: marker.targetMode, activeMode, error });
      console.warn("[window-presentation-switch] startup confirmation write failed", error);
    }
    await this.store.clear().catch((error) => {
      this.report("error", "window.presentation.switch.confirmation_cleanup_failed", { previousMode: marker.previousMode, targetMode: marker.targetMode, activeMode, error });
      console.warn("[window-presentation-switch] startup confirmation cleanup failed", error);
    });
    this.report("info", "window.presentation.switch.completed", { previousMode: marker.previousMode, targetMode: marker.targetMode, activeMode });
  }

  async requestSwitch(targetMode: WindowPresentationMode): Promise<WindowPresentationSwitchResult> {
    const normalizedTargetMode = normalizeWindowPresentationMode(targetMode);
    const activeMode = this.options.getActiveMode();
    if (normalizedTargetMode === activeMode) {
      this.report("info", "window.presentation.switch.result", { activeMode, targetMode: normalizedTargetMode, status: "unchanged" });
      return { status: "unchanged", targetMode: normalizedTargetMode };
    }
    if (this.switchInProgress) {
      this.report("warn", "window.presentation.switch.result", { activeMode, targetMode: normalizedTargetMode, status: "busy" });
      return { status: "busy", targetMode: normalizedTargetMode };
    }
    this.switchInProgress = true;
    const marker = this.marker(activeMode, normalizedTargetMode, "pending");
    this.report("info", "window.presentation.switch.requested", { activeMode, targetMode: normalizedTargetMode });
    try {
      await this.store.write(marker);
      const preferences = await this.options.updatePreference(normalizedTargetMode);
      if (preferences.windowPresentationMode !== normalizedTargetMode) throw new Error("Window presentation preference was not persisted.");
      this.report("info", "window.presentation.switch.result", { activeMode, targetMode: normalizedTargetMode, status: "restarting" });
      await this.options.flushBeforeRestart();
      this.options.relaunch();
      this.scheduleQuit();
      return { status: "restarting", targetMode: normalizedTargetMode };
    } catch (error) {
      this.report("error", "window.presentation.switch.result", { activeMode, targetMode: normalizedTargetMode, status: "failed", error });
      console.warn("[window-presentation-switch] controlled restart failed", error);
      await this.rollback(marker).catch((rollbackError) => {
        console.warn("[window-presentation-switch] preference rollback failed", rollbackError);
      });
      this.switchInProgress = false;
      return { status: "failed", targetMode: normalizedTargetMode };
    }
  }
}

export const createWindowPresentationSwitchRuntime = (options: WindowPresentationSwitchRuntimeOptions) => {
  const runtime = new WindowPresentationSwitchRuntime(options);
  registerIpcDomain({
    registrar: options.registrar,
    isSenderAllowed: options.isSenderAllowed,
    registrations: [
      {
        kind: "handle",
        channel: "app:quit",
        listener: () => {
          options.setQuitting();
          options.quit();
          return true;
        }
      },
      {
        kind: "handle",
        channel: "app:switchWindowPresentationMode",
        listener: (_event, targetMode: unknown) => {
          if (!isWindowPresentationMode(targetMode)) throw new Error("Invalid window presentation mode.");
          return runtime.requestSwitch(targetMode);
        }
      }
    ]
  });
  return runtime;
};
