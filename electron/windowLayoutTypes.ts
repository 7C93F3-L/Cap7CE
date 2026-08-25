export type PersistedWindowLayoutState = "micro" | "mini" | "normal";
export type WindowDockEdge = "left" | "right" | "top" | "bottom";

export interface WindowLayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowLayoutDisplaySnapshot {
  id: number;
  bounds: WindowLayoutBounds;
  workArea: WindowLayoutBounds;
  scaleFactor: number;
}

export interface WindowLayoutProfile {
  expandedBounds: WindowLayoutBounds;
  displayId: number;
  displayBoundsSnapshot: WindowLayoutBounds;
  workAreaSnapshot: WindowLayoutBounds;
  scaleFactor: number;
  dockEdge: WindowDockEdge | null;
  updatedAt: string;
}

export interface WindowLayoutDocument {
  version: 1;
  lastDockEdge: WindowDockEdge | null;
  lastDockDisplayId: number | null;
  profiles: Partial<Record<PersistedWindowLayoutState, WindowLayoutProfile>>;
}

export const WINDOW_LAYOUT_DOCUMENT_VERSION = 1 as const;

export const createDefaultWindowLayoutDocument = (): WindowLayoutDocument => ({
  version: WINDOW_LAYOUT_DOCUMENT_VERSION,
  lastDockEdge: null,
  lastDockDisplayId: null,
  profiles: {}
});
