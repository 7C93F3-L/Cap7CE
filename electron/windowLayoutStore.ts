import fs from "node:fs/promises";
import path from "node:path";
import {
  createDefaultWindowLayoutDocument,
  WINDOW_LAYOUT_DOCUMENT_VERSION,
  type PersistedWindowLayoutState,
  type WindowDockEdge,
  type WindowLayoutBounds,
  type WindowLayoutDocument,
  type WindowLayoutProfile
} from "./windowLayoutTypes";

const layoutStates: PersistedWindowLayoutState[] = ["micro", "mini", "normal"];
const dockEdges: WindowDockEdge[] = ["left", "right", "top", "bottom"];

const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validBounds = (value: unknown): value is WindowLayoutBounds => {
  if (!value || typeof value !== "object") return false;
  const bounds = value as Partial<WindowLayoutBounds>;
  return finiteNumber(bounds.x)
    && finiteNumber(bounds.y)
    && finiteNumber(bounds.width)
    && finiteNumber(bounds.height)
    && bounds.width > 0
    && bounds.height > 0;
};
const validDockEdge = (value: unknown): value is WindowDockEdge => (
  typeof value === "string" && dockEdges.includes(value as WindowDockEdge)
);

const normalizeProfile = (value: unknown): WindowLayoutProfile | null => {
  if (!value || typeof value !== "object") return null;
  const profile = value as Partial<WindowLayoutProfile>;
  if (
    !validBounds(profile.expandedBounds)
    || !finiteNumber(profile.displayId)
    || !validBounds(profile.displayBoundsSnapshot)
    || !validBounds(profile.workAreaSnapshot)
    || !finiteNumber(profile.scaleFactor)
    || profile.scaleFactor <= 0
    || (profile.dockEdge !== null && !validDockEdge(profile.dockEdge))
    || typeof profile.updatedAt !== "string"
    || !Number.isFinite(Date.parse(profile.updatedAt))
  ) {
    return null;
  }
  return {
    expandedBounds: { ...profile.expandedBounds },
    displayId: profile.displayId,
    displayBoundsSnapshot: { ...profile.displayBoundsSnapshot },
    workAreaSnapshot: { ...profile.workAreaSnapshot },
    scaleFactor: profile.scaleFactor,
    dockEdge: profile.dockEdge,
    updatedAt: profile.updatedAt
  };
};

export const normalizeWindowLayoutDocument = (value: unknown): WindowLayoutDocument => {
  const defaults = createDefaultWindowLayoutDocument();
  if (!value || typeof value !== "object") return defaults;
  const document = value as Partial<WindowLayoutDocument>;
  if (document.version !== WINDOW_LAYOUT_DOCUMENT_VERSION) return defaults;
  const profiles: WindowLayoutDocument["profiles"] = {};
  for (const state of layoutStates) {
    const profile = normalizeProfile(document.profiles?.[state]);
    if (profile) profiles[state] = profile;
  }
  return {
    version: WINDOW_LAYOUT_DOCUMENT_VERSION,
    lastDockEdge: validDockEdge(document.lastDockEdge) ? document.lastDockEdge : null,
    lastDockDisplayId: finiteNumber(document.lastDockDisplayId) ? document.lastDockDisplayId : null,
    profiles
  };
};

export const readWindowLayoutDocument = async (filePath: string): Promise<WindowLayoutDocument> => {
  try {
    return normalizeWindowLayoutDocument(JSON.parse(await fs.readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return createDefaultWindowLayoutDocument();
    try {
      await fs.copyFile(filePath, `${filePath}.corrupt-${Date.now()}`);
    } catch {
      // A damaged optional layout record must never block application startup.
    }
    return createDefaultWindowLayoutDocument();
  }
};

export const writeWindowLayoutDocument = async (filePath: string, value: unknown) => {
  const document = normalizeWindowLayoutDocument(value);
  const temporaryPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
  return document;
};

export class WindowLayoutStore {
  private pendingDocument: WindowLayoutDocument | null = null;
  private writeTimer: NodeJS.Timeout | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly debounceMs = 300
  ) {}

  load() {
    return readWindowLayoutDocument(this.filePath);
  }

  schedule(value: unknown) {
    this.pendingDocument = normalizeWindowLayoutDocument(value);
    if (this.writeTimer !== null) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.flush().catch((error) => {
        console.warn("[window-layout] deferred write failed", error);
      });
    }, this.debounceMs);
  }

  async flush() {
    if (this.writeTimer !== null) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    const document = this.pendingDocument;
    this.pendingDocument = null;
    if (document) {
      this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
        await writeWindowLayoutDocument(this.filePath, document);
      });
    }
    await this.writeQueue;
  }
}
