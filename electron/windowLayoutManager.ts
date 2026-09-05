import {
  detectWindowDockEdge,
  inferTaskbarEdge,
  resolveRememberedWindowBounds,
  selectWindowLayoutDisplay
} from "./windowLayoutGeometry";
import { WindowLayoutStore } from "./windowLayoutStore";
import {
  createDefaultWindowLayoutDocument,
  type PersistedWindowLayoutState,
  type WindowLayoutBounds,
  type WindowLayoutDisplaySnapshot,
  type WindowLayoutDocument,
  type WindowDockEdge
} from "./windowLayoutTypes";

export interface WindowLayoutMemoryPreferences {
  rememberWindowLayout: boolean;
}

interface ShellLayoutDisplayLike {
  id: number;
  bounds: WindowLayoutBounds;
  workArea: WindowLayoutBounds;
  scaleFactor: number;
}

export const toWindowLayoutDisplaySnapshot = (display: ShellLayoutDisplayLike): WindowLayoutDisplaySnapshot => ({
  id: display.id,
  bounds: { ...display.bounds },
  workArea: { ...display.workArea },
  scaleFactor: display.scaleFactor
});

export class WindowLayoutManager {
  private document: WindowLayoutDocument = createDefaultWindowLayoutDocument();
  private runtimeDockTarget: { edge: WindowDockEdge; displayId: number } | null = null;
  private preferences: WindowLayoutMemoryPreferences = {
    rememberWindowLayout: false
  };

  constructor(private readonly store: WindowLayoutStore) {}

  async load() {
    this.document = await this.store.load();
    return this.document;
  }

  setPreferences(preferences: WindowLayoutMemoryPreferences) {
    this.preferences = { ...preferences };
  }

  resolveBounds({
    state,
    displays,
    currentDisplay,
    defaultBounds,
    minimumSize,
    maximumSize,
    fixedHeight
  }: {
    state: PersistedWindowLayoutState;
    displays: WindowLayoutDisplaySnapshot[];
    currentDisplay: WindowLayoutDisplaySnapshot;
    defaultBounds: (display: WindowLayoutDisplaySnapshot) => WindowLayoutBounds;
    minimumSize: { width: number; height: number };
    maximumSize?: { width?: number; height?: number };
    fixedHeight?: number;
  }) {
    const profile = this.document.profiles[state] ?? null;
    const targetDisplay = this.preferences.rememberWindowLayout && profile
      ? selectWindowLayoutDisplay(displays, profile) ?? currentDisplay
      : currentDisplay;
    return resolveRememberedWindowBounds({
      defaultBounds: defaultBounds(targetDisplay),
      profile,
      targetWorkArea: targetDisplay.workArea,
      rememberLayout: this.preferences.rememberWindowLayout,
      minimumSize,
      maximumSize,
      fixedHeight
    });
  }

  resolveStandbyLinePlacement(currentDisplay: WindowLayoutDisplaySnapshot) {
    return {
      display: currentDisplay,
      edge: inferTaskbarEdge(currentDisplay.bounds, currentDisplay.workArea) ?? "bottom"
    };
  }

  captureBounds({
    state,
    bounds,
    display,
    dockThreshold = 12
  }: {
    state: PersistedWindowLayoutState;
    bounds: WindowLayoutBounds;
    display: WindowLayoutDisplaySnapshot;
    dockThreshold?: number;
  }) {
    const preferredEdge = this.runtimeDockTarget?.edge ?? this.document.profiles[state]?.dockEdge ?? null;
    const dockEdge = detectWindowDockEdge(bounds, display.workArea, dockThreshold, preferredEdge);
    if (dockEdge) this.runtimeDockTarget = { edge: dockEdge, displayId: display.id };
    if (!this.preferences.rememberWindowLayout) return false;
    this.document = {
      ...this.document,
      lastDockEdge: dockEdge ?? this.document.lastDockEdge,
      lastDockDisplayId: dockEdge ? display.id : this.document.lastDockDisplayId,
      profiles: {
        ...this.document.profiles,
        [state]: {
          expandedBounds: { ...bounds },
          displayId: display.id,
          displayBoundsSnapshot: { ...display.bounds },
          workAreaSnapshot: { ...display.workArea },
          scaleFactor: display.scaleFactor,
          dockEdge,
          updatedAt: new Date().toISOString()
        }
      }
    };
    this.store.schedule(this.document);
    return true;
  }

  flush() {
    return this.store.flush();
  }
}
