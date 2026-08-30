import { clampWindowLayoutBounds, detectWindowDockEdge, inferTaskbarEdge } from "./windowLayoutGeometry";
import { getShellMousePollDelay } from "./shellMousePollingPolicy";
import type { WindowDockEdge, WindowLayoutBounds, WindowLayoutDisplaySnapshot } from "./windowLayoutTypes";

type DockedShellActionResult =
  | { status: "collapsed"; edge: WindowDockEdge }
  | { status: "expanded" }
  | { status: "blocked"; reason: "not-docked" | "taskbar-edge" | "display-seam" | "shell-state" | "window-unavailable" }
  | { status: "unavailable" };

interface DockedShellWindow {
  focus: () => void;
  getBounds: () => WindowLayoutBounds;
  hasShadow: () => boolean;
  isDestroyed: () => boolean;
  isVisible: () => boolean;
  moveTop: () => void;
  setBounds: (bounds: WindowLayoutBounds, animate?: boolean) => void;
  setHasShadow: (hasShadow: boolean) => void;
}

interface DockedShellControllerOptions {
  collapsibleStates?: ReadonlySet<string>;
  dockThreshold?: number;
  enabled: boolean;
  fixed?: boolean;
  getCursorPoint: () => { x: number; y: number };
  getDisplay: (bounds: WindowLayoutBounds) => WindowLayoutDisplaySnapshot;
  getShellContext: () => { state: string; maximized: boolean; interactionBlocked: boolean };
  hideLine: () => void;
  isDockEdgeExposed?: (
    display: WindowLayoutDisplaySnapshot,
    edge: WindowDockEdge,
    bounds: WindowLayoutBounds
  ) => boolean;
  markProgrammaticMove: () => void;
  markProgrammaticResize?: () => void;
  now?: () => number;
  peekThickness?: number;
  revealThickness?: number;
  setCollapsedLayerActive?: (active: boolean) => void;
  window: DockedShellWindow;
}

interface DockSession {
  armed: boolean;
  display: WindowLayoutDisplaySnapshot;
  edge: WindowDockEdge;
  edgeInset: number;
  expandedBounds: WindowLayoutBounds;
}

const collapsibleShellStates = new Set(["micro", "mini", "normal"]);
export const dockedShellDockThresholdPx = 40;
export const dockedShellPeekThicknessPx = 5;
export const dockedShellRevealThicknessPx = 2;

export class DockedShellController {
  private armNextSession = false;
  private collapsed = false;
  private collapsedLayerActive = false;
  private disposed = false;
  private enabled: boolean;
  private fixed: boolean;
  private lastCursorPoint: { x: number; y: number } | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private restoreShadow: boolean | null = null;
  private session: DockSession | null = null;
  private started = false;
  private stationaryPollCount = 0;
  private suppressedUntil = 0;

  constructor(private readonly options: DockedShellControllerOptions) {
    this.enabled = options.enabled;
    this.fixed = Boolean(options.fixed);
  }

  getState() {
    return this.collapsed && this.session ? { edge: this.session.edge } : null;
  }

  hasActiveSession() {
    return this.session !== null;
  }

  start() {
    this.started = true;
    if (this.enabled) this.schedulePoll(0);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.stopPolling();
      this.reset(false);
    } else if (this.started) {
      this.schedulePoll(0);
    }
  }

  setFixed(fixed: boolean) {
    this.fixed = fixed;
    if (fixed) {
      this.restore(true);
      return;
    }
    this.armNextSession = true;
    if (this.started) this.schedulePoll(0);
  }

  getExpandedBounds() {
    if (this.collapsed && this.session) return { ...this.session.expandedBounds };
    if (this.options.window.isDestroyed()) return null;
    return this.options.window.getBounds();
  }

  updateExpandedBounds(bounds: WindowLayoutBounds) {
    if (!this.collapsed || !this.session || this.options.window.isDestroyed()) return false;
    this.session.expandedBounds = this.alignBoundsToSessionEdge(bounds, this.session);
    this.session.display = this.options.getDisplay(this.session.expandedBounds);
    this.options.markProgrammaticMove();
    this.options.window.setBounds(this.getCollapsedWindowBounds(this.session), false);
    return true;
  }

  reconcileDisplayConfiguration() {
    const { window } = this.options;
    const context = this.options.getShellContext();
    if (window.isDestroyed() || !window.isVisible() || !this.isCollapsibleState(context.state) || context.maximized) return false;
    const expandedBounds = this.getExpandedBounds();
    if (!expandedBounds) return false;
    const display = this.options.getDisplay(expandedBounds);
    const nextBounds = clampWindowLayoutBounds(expandedBounds, display.workArea);
    const currentBounds = window.getBounds();
    const changed = currentBounds.x !== nextBounds.x
      || currentBounds.y !== nextBounds.y
      || currentBounds.width !== nextBounds.width
      || currentBounds.height !== nextBounds.height;
    if (this.restoreShadow !== null) {
      window.setHasShadow(this.restoreShadow);
      this.restoreShadow = null;
    }
    this.setCollapsedLayerActive(false);
    this.collapsed = false;
    this.session = null;
    this.armNextSession = false;
    if (!changed) return false;
    if (currentBounds.width !== nextBounds.width || currentBounds.height !== nextBounds.height) {
      this.options.markProgrammaticResize?.();
    }
    this.options.markProgrammaticMove();
    window.setBounds(nextBounds, false);
    return true;
  }

  toggle(): DockedShellActionResult {
    if (!this.enabled || this.fixed) return { status: "unavailable" };
    if (this.collapsed) {
      this.expand(true);
      return { status: "expanded" };
    }
    const blocked = this.refreshSession(this.options.getCursorPoint());
    if (blocked) return blocked;
    this.collapse();
    return { status: "collapsed", edge: this.session!.edge };
  }

  restore(focus = false) {
    if (!this.collapsed) return false;
    this.expand(focus);
    return true;
  }

  reset(focus = false) {
    const wasCollapsed = this.collapsed;
    if (wasCollapsed) this.restoreExpandedBounds(focus);
    this.setCollapsedLayerActive(false);
    this.collapsed = false;
    this.session = null;
    this.armNextSession = false;
    return wasCollapsed;
  }

  noteUserWindowInteraction(durationMs = 520) {
    if (!this.collapsed) this.session = null;
    this.armNextSession = true;
    this.suppressFor(durationMs);
  }

  suppressFor(durationMs: number) {
    this.suppressedUntil = Math.max(this.suppressedUntil, this.now() + Math.max(0, durationMs));
  }

  runSuppressed<T>(action: () => T): T {
    this.suppressedUntil = Number.POSITIVE_INFINITY;
    try {
      return action();
    } finally {
      this.suppressedUntil = this.now() + 250;
    }
  }

  sampleCursor(point: { x: number; y: number }, now = this.now()) {
    if (!this.enabled || this.disposed) return;
    const { window } = this.options;
    const context = this.options.getShellContext();
    if (window.isDestroyed() || !window.isVisible() || !this.isCollapsibleState(context.state) || context.maximized) {
      this.reset(false);
      return;
    }

    if (this.fixed) {
      this.restore(false);
      return;
    }

    if (this.collapsed) {
      if (!this.session || !this.isCollapsedSessionValid()) {
        this.reset(false);
        return;
      }
      if (this.isPointInside(point, this.getRevealScreenBounds(this.session))) this.expand(false, true);
      return;
    }

    if (context.interactionBlocked || now < this.suppressedUntil) return;
    if (this.session && !this.isSessionStillDocked()) this.session = null;
    if (!this.session) {
      const blocked = this.refreshSession(point);
      if (blocked) return;
    }

    const session = this.session;
    if (!session) return;
    this.captureExpandedBounds(window.getBounds(), session);
    if (this.isPointInsideExpandedHoverRegion(point, session)) {
      session.armed = true;
      return;
    }
    if (session.armed) this.collapse();
  }

  dispose() {
    this.disposed = true;
    this.enabled = false;
    this.started = false;
    this.stopPolling();
    this.reset(false);
  }

  private refreshSession(point: { x: number; y: number }): DockedShellActionResult | null {
    const { window } = this.options;
    const context = this.options.getShellContext();
    if (window.isDestroyed() || !window.isVisible()) return { status: "blocked", reason: "window-unavailable" };
    if (!this.isCollapsibleState(context.state) || context.maximized) return { status: "blocked", reason: "shell-state" };

    const expandedBounds = window.getBounds();
    const display = this.options.getDisplay(expandedBounds);
    const taskbarEdge = inferTaskbarEdge(display.bounds, display.workArea) ?? "bottom";
    const threshold = this.options.dockThreshold ?? dockedShellDockThresholdPx;
    const nearestEdge = detectWindowDockEdge(expandedBounds, display.workArea, threshold);
    const edge = detectWindowDockEdge(expandedBounds, display.workArea, threshold, null, [taskbarEdge]);
    if (!edge) {
      this.session = null;
      return { status: "blocked", reason: nearestEdge === taskbarEdge ? "taskbar-edge" : "not-docked" };
    }
    if (this.options.isDockEdgeExposed && !this.options.isDockEdgeExposed(display, edge, expandedBounds)) {
      this.session = null;
      return { status: "blocked", reason: "display-seam" };
    }
    const session = {
      edge,
      display,
      edgeInset: this.getEdgeInset(expandedBounds, display.workArea, edge),
      expandedBounds,
      armed: false
    };
    session.expandedBounds = this.alignBoundsToSessionEdge(expandedBounds, session);
    session.armed = this.armNextSession || this.isPointInsideExpandedHoverRegion(point, session);
    this.armNextSession = false;
    this.session = session;
    return null;
  }

  private isSessionStillDocked() {
    if (!this.session) return false;
    const bounds = this.options.window.getBounds();
    const display = this.options.getDisplay(bounds);
    const taskbarEdge = inferTaskbarEdge(display.bounds, display.workArea) ?? "bottom";
    const threshold = this.options.dockThreshold ?? dockedShellDockThresholdPx;
    return this.session.edge !== taskbarEdge
      && detectWindowDockEdge(bounds, display.workArea, threshold, this.session.edge, [taskbarEdge]) === this.session.edge;
  }

  private isCollapsedSessionValid() {
    if (!this.session) return false;
    const display = this.options.getDisplay(this.session.expandedBounds);
    const taskbarEdge = inferTaskbarEdge(display.bounds, display.workArea) ?? "bottom";
    return display.id === this.session.display.id && this.session.edge !== taskbarEdge;
  }

  private collapse() {
    const session = this.session;
    const { window } = this.options;
    if (!session || this.collapsed || window.isDestroyed()) return;
    this.captureExpandedBounds(window.getBounds(), session);
    this.options.hideLine();
    this.restoreShadow = window.hasShadow();
    window.setHasShadow(false);
    this.collapsed = true;
    this.setCollapsedLayerActive(true);
    this.options.markProgrammaticMove();
    window.setBounds(this.getCollapsedWindowBounds(session), false);
  }

  private expand(focus: boolean, armForMouseLeave = false) {
    if (!this.collapsed || !this.session) return;
    this.restoreExpandedBounds(focus);
    this.collapsed = false;
    this.session.armed = armForMouseLeave;
  }

  private restoreExpandedBounds(focus: boolean) {
    const { window } = this.options;
    if (window.isDestroyed() || !this.session) return;
    this.options.markProgrammaticMove();
    window.setBounds(this.session.expandedBounds, false);
    this.setCollapsedLayerActive(false);
    if (this.restoreShadow !== null) {
      window.setHasShadow(this.restoreShadow);
      this.restoreShadow = null;
    }
    if (window.isVisible()) {
      if (focus) window.focus();
      window.moveTop();
    }
  }

  private setCollapsedLayerActive(active: boolean) {
    if (this.collapsedLayerActive === active) return;
    this.collapsedLayerActive = active;
    this.options.setCollapsedLayerActive?.(active);
  }

  private getCollapsedWindowBounds(session: DockSession): WindowLayoutBounds {
    const { edge, expandedBounds } = session;
    const display = session.display.bounds;
    const peek = Math.max(1, Math.round(this.options.peekThickness ?? dockedShellPeekThicknessPx));
    if (edge === "left") return { ...expandedBounds, x: display.x - expandedBounds.width + peek };
    if (edge === "right") return { ...expandedBounds, x: display.x + display.width - peek };
    if (edge === "top") return { ...expandedBounds, y: display.y - expandedBounds.height + peek };
    return { ...expandedBounds, y: display.y + display.height - peek };
  }

  private alignBoundsToSessionEdge(bounds: WindowLayoutBounds, session: DockSession): WindowLayoutBounds {
    const { workArea } = session.display;
    const maximumX = Math.max(workArea.x, workArea.x + workArea.width - bounds.width);
    const maximumY = Math.max(workArea.y, workArea.y + workArea.height - bounds.height);
    const x = session.edge === "left"
      ? Math.min(maximumX, workArea.x + session.edgeInset)
      : session.edge === "right"
        ? Math.max(workArea.x, maximumX - session.edgeInset)
        : Math.min(maximumX, Math.max(workArea.x, bounds.x));
    const y = session.edge === "top"
      ? Math.min(maximumY, workArea.y + session.edgeInset)
      : session.edge === "bottom"
        ? Math.max(workArea.y, maximumY - session.edgeInset)
        : Math.min(maximumY, Math.max(workArea.y, bounds.y));
    return { ...bounds, x, y };
  }

  private captureExpandedBounds(bounds: WindowLayoutBounds, session: DockSession) {
    session.display = this.options.getDisplay(bounds);
    session.expandedBounds = this.alignBoundsToSessionEdge(bounds, session);
  }

  private getEdgeInset(bounds: WindowLayoutBounds, workArea: WindowLayoutBounds, edge: WindowDockEdge) {
    const inset = edge === "left"
      ? bounds.x - workArea.x
      : edge === "right"
        ? workArea.x + workArea.width - bounds.x - bounds.width
        : edge === "top"
          ? bounds.y - workArea.y
          : workArea.y + workArea.height - bounds.y - bounds.height;
    return Math.max(0, Math.round(inset));
  }

  private getRevealScreenBounds(session: DockSession): WindowLayoutBounds {
    const { edge, expandedBounds } = session;
    const display = session.display.bounds;
    const thickness = Math.max(1, Math.round(this.options.revealThickness ?? dockedShellRevealThicknessPx));
    if (edge === "left") return { x: display.x, y: expandedBounds.y, width: thickness, height: expandedBounds.height };
    if (edge === "right") return { x: display.x + display.width - thickness, y: expandedBounds.y, width: thickness, height: expandedBounds.height };
    if (edge === "top") return { x: expandedBounds.x, y: display.y, width: expandedBounds.width, height: thickness };
    return { x: expandedBounds.x, y: display.y + display.height - thickness, width: expandedBounds.width, height: thickness };
  }

  private isPointInsideExpandedHoverRegion(point: { x: number; y: number }, session: DockSession) {
    const { edge, expandedBounds } = session;
    const display = session.display.bounds;
    if (edge === "left" || edge === "right") {
      const left = edge === "left" ? Math.min(display.x, expandedBounds.x) : expandedBounds.x;
      const right = edge === "right"
        ? Math.max(display.x + display.width, expandedBounds.x + expandedBounds.width)
        : expandedBounds.x + expandedBounds.width;
      return point.x >= left && point.x < right
        && point.y >= expandedBounds.y && point.y < expandedBounds.y + expandedBounds.height;
    }
    const top = edge === "top" ? Math.min(display.y, expandedBounds.y) : expandedBounds.y;
    const bottom = edge === "bottom"
      ? Math.max(display.y + display.height, expandedBounds.y + expandedBounds.height)
      : expandedBounds.y + expandedBounds.height;
    return point.x >= expandedBounds.x && point.x < expandedBounds.x + expandedBounds.width
      && point.y >= top && point.y < bottom;
  }

  private schedulePoll(delayMs: number) {
    if (!this.enabled || this.disposed || this.pollTimer !== null) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      const point = this.options.getCursorPoint();
      this.stationaryPollCount = this.lastCursorPoint
        && this.lastCursorPoint.x === point.x
        && this.lastCursorPoint.y === point.y
        ? this.stationaryPollCount + 1
        : 0;
      this.lastCursorPoint = point;
      this.sampleCursor(point);
      if (!this.options.window.isDestroyed()) {
        const targetBounds = this.collapsed && this.session
          ? this.getRevealScreenBounds(this.session)
          : this.options.window.getBounds();
        this.schedulePoll(getShellMousePollDelay(point, targetBounds, this.stationaryPollCount));
      }
    }, Math.max(0, delayMs));
  }

  private stopPolling() {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    this.lastCursorPoint = null;
    this.stationaryPollCount = 0;
  }

  private isPointInside(point: { x: number; y: number }, bounds: WindowLayoutBounds) {
    return point.x >= bounds.x && point.x < bounds.x + bounds.width
      && point.y >= bounds.y && point.y < bounds.y + bounds.height;
  }

  private isCollapsibleState(state: string) {
    return (this.options.collapsibleStates ?? collapsibleShellStates).has(state);
  }

  private now() {
    return this.options.now?.() ?? Date.now();
  }
}
