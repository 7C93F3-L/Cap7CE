import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveRememberedWindowBounds, selectWindowLayoutDisplay } from "./windowLayoutGeometry";
import type { WindowLayoutBounds, WindowLayoutDisplaySnapshot, WindowLayoutProfile } from "./windowLayoutTypes";

export const SETTINGS_WINDOW_LAYOUT_VERSION = 1 as const;
export const SETTINGS_WINDOW_DEFAULT_SIZE = { width: 860, height: 680 } as const;
export const SETTINGS_WINDOW_MINIMUM_SIZE = { width: 620, height: 480 } as const;

interface SettingsWindowLayoutDocument {
  version: typeof SETTINGS_WINDOW_LAYOUT_VERSION;
  profile: WindowLayoutProfile | null;
}

const createDefaultDocument = (): SettingsWindowLayoutDocument => ({
  version: SETTINGS_WINDOW_LAYOUT_VERSION,
  profile: null
});

const isFiniteBounds = (value: unknown): value is WindowLayoutBounds => {
  if (!value || typeof value !== "object") return false;
  const bounds = value as Partial<WindowLayoutBounds>;
  return [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    && Number(bounds.width) > 0
    && Number(bounds.height) > 0;
};

const isProfile = (value: unknown): value is WindowLayoutProfile => {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<WindowLayoutProfile>;
  return isFiniteBounds(profile.expandedBounds)
    && Number.isFinite(profile.displayId)
    && isFiniteBounds(profile.displayBoundsSnapshot)
    && isFiniteBounds(profile.workAreaSnapshot)
    && Number.isFinite(profile.scaleFactor) && Number(profile.scaleFactor) > 0
    && profile.dockEdge === null
    && typeof profile.updatedAt === "string" && Number.isFinite(Date.parse(profile.updatedAt));
};

const normalizeDocument = (value: unknown): SettingsWindowLayoutDocument => {
  if (!value || typeof value !== "object") return createDefaultDocument();
  const document = value as Partial<SettingsWindowLayoutDocument>;
  if (document.version !== SETTINGS_WINDOW_LAYOUT_VERSION) return createDefaultDocument();
  return { version: SETTINGS_WINDOW_LAYOUT_VERSION, profile: isProfile(document.profile) ? document.profile : null };
};

export const createSettingsWindowLayoutProfile = (
  bounds: WindowLayoutBounds,
  display: WindowLayoutDisplaySnapshot,
  updatedAt = new Date().toISOString()
): WindowLayoutProfile => ({
  expandedBounds: { ...bounds },
  displayId: display.id,
  displayBoundsSnapshot: { ...display.bounds },
  workAreaSnapshot: { ...display.workArea },
  scaleFactor: display.scaleFactor,
  dockEdge: null,
  updatedAt
});

export const resolveSettingsWindowInitialBounds = (
  profile: WindowLayoutProfile | null,
  displays: WindowLayoutDisplaySnapshot[],
  primaryDisplay: WindowLayoutDisplaySnapshot
): WindowLayoutBounds => {
  const targetDisplay = profile ? selectWindowLayoutDisplay(displays, profile) ?? primaryDisplay : primaryDisplay;
  const width = Math.min(SETTINGS_WINDOW_DEFAULT_SIZE.width, targetDisplay.workArea.width);
  const height = Math.min(SETTINGS_WINDOW_DEFAULT_SIZE.height, targetDisplay.workArea.height);
  const defaultBounds = {
    x: targetDisplay.workArea.x + Math.round((targetDisplay.workArea.width - width) / 2),
    y: targetDisplay.workArea.y + Math.round((targetDisplay.workArea.height - height) / 2),
    width,
    height
  };
  return resolveRememberedWindowBounds({
    defaultBounds,
    profile,
    targetWorkArea: targetDisplay.workArea,
    rememberLayout: true,
    minimumSize: SETTINGS_WINDOW_MINIMUM_SIZE
  });
};

export class SettingsWindowLayoutStore {
  private document = createDefaultDocument();
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<SettingsWindowLayoutDocument> {
    try {
      this.document = normalizeDocument(JSON.parse(await fs.readFile(this.filePath, "utf8")));
    } catch {
      this.document = createDefaultDocument();
    }
    return structuredClone(this.document);
  }

  get profile() {
    return this.document.profile ? structuredClone(this.document.profile) : null;
  }

  setProfile(profile: WindowLayoutProfile) {
    this.document = { version: SETTINGS_WINDOW_LAYOUT_VERSION, profile: structuredClone(profile) };
    const snapshot = JSON.stringify(this.document, null, 2);
    this.pendingWrite = this.pendingWrite.catch(() => undefined).then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(temporaryPath, `${snapshot}\n`, "utf8");
      try {
        await fs.rename(temporaryPath, this.filePath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EPERM" && code !== "EEXIST") throw error;
        await fs.copyFile(temporaryPath, this.filePath);
        await fs.rm(temporaryPath, { force: true });
      }
    });
  }

  async flush() {
    await this.pendingWrite;
  }
}
