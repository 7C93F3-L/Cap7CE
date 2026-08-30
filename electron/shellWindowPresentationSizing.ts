import { getDefaultShellLayoutBounds, type WindowLayoutManager } from "./windowLayoutManager";
import type { PersistedWindowLayoutState, WindowLayoutBounds, WindowLayoutDisplaySnapshot } from "./windowLayoutTypes";
import { toWindowContentBounds, toWindowContentWorkArea, toWindowOuterBounds, toWindowOuterMinimumSize } from "./windowPresentationGeometry";

export type PresentationShellState = "standby" | "capsule" | "micro" | "mini" | "normal" | "settings";

interface ShellWindowPresentationSizingOptions {
  getTitlebarHeight: () => number;
  capsuleWidth: number;
  capsuleHeight: number;
  microHeight: number;
  miniHeight: number;
  minimumWidth: number;
  minimumHeight: number;
  normalMinimumWidth: number;
  normalMinimumHeight: number;
  miniMaximumWidth: number;
  microLayoutMaximumHeight: number;
  edgeGap: number;
  edgeAnchorThreshold: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export class ShellWindowPresentationSizing {
  constructor(private readonly options: ShellWindowPresentationSizingOptions) {}

  getContentBounds(bounds: WindowLayoutBounds) {
    return toWindowContentBounds(bounds, this.options.getTitlebarHeight());
  }

  getContentWorkArea(workArea: WindowLayoutBounds) {
    return toWindowContentWorkArea(workArea, this.options.getTitlebarHeight());
  }

  getOuterMinimumSize(size: Pick<WindowLayoutBounds, "width" | "height">) {
    return toWindowOuterMinimumSize(size, this.options.getTitlebarHeight());
  }

  resolveBounds({
    state,
    capsuleEdge = "bottom",
    currentDisplay,
    displays,
    layoutManager
  }: {
    state: PresentationShellState;
    capsuleEdge?: "top" | "bottom";
    currentDisplay: WindowLayoutDisplaySnapshot;
    displays: WindowLayoutDisplaySnapshot[];
    layoutManager: WindowLayoutManager;
  }): WindowLayoutBounds {
    const persistedState: PersistedWindowLayoutState | null = state === "settings"
      ? "normal"
      : state === "micro" || state === "mini" || state === "normal"
        ? state
        : null;
    const verticalAnchor = state === "capsule" || state === "micro" || state === "mini" ? "bottom" : "center";
    const defaultBounds = (workArea: WindowLayoutBounds) => toWindowOuterBounds(
      getDefaultShellLayoutBounds(state, workArea, {
        capsuleWidth: this.options.capsuleWidth,
        capsuleHeight: this.options.capsuleHeight,
        capsuleEdge,
        microHeight: this.options.microHeight,
        miniHeight: this.options.miniHeight,
        edgeGap: this.options.edgeGap
      }),
      this.options.getTitlebarHeight(),
      verticalAnchor
    );
    if (!persistedState) return defaultBounds(currentDisplay.workArea);
    const contentMinimumSize = persistedState === "normal"
      ? { width: this.options.normalMinimumWidth, height: this.options.normalMinimumHeight }
      : { width: this.options.minimumWidth, height: this.options.minimumHeight };
    return layoutManager.resolveBounds({
      state: persistedState,
      displays,
      currentDisplay,
      defaultBounds: (display) => defaultBounds(display.workArea),
      minimumSize: this.getOuterMinimumSize(contentMinimumSize),
      maximumSize: persistedState === "mini" ? { width: this.options.miniMaximumWidth } : undefined,
      fixedHeight: persistedState === "micro" ? this.options.microHeight + this.options.getTitlebarHeight() : undefined
    });
  }

  getMicroResizeBounds(currentBounds: WindowLayoutBounds, workArea: WindowLayoutBounds): WindowLayoutBounds {
    const workRight = workArea.x + workArea.width;
    const workBottom = workArea.y + workArea.height;
    const nextWidth = Math.min(workArea.width, Math.max(this.options.minimumWidth, Math.round(currentBounds.width)));
    const nextHeight = this.options.microHeight + this.options.getTitlebarHeight();
    const minX = workArea.x + this.options.edgeGap;
    const minY = workArea.y + this.options.edgeGap;
    const maxX = Math.max(minX, workRight - nextWidth - this.options.edgeGap);
    const maxY = Math.max(minY, workBottom - nextHeight - this.options.edgeGap);
    const currentRightGap = Math.abs(workRight - (currentBounds.x + currentBounds.width) - this.options.edgeGap);
    const currentBottomGap = Math.abs(workBottom - (currentBounds.y + currentBounds.height) - this.options.edgeGap);
    const isLeftAnchored = Math.abs(currentBounds.x - minX) <= this.options.edgeAnchorThreshold;
    const isRightAnchored = currentRightGap <= this.options.edgeAnchorThreshold;
    const isTopAnchored = Math.abs(currentBounds.y - minY) <= this.options.edgeAnchorThreshold;
    const isBottomAnchored = currentBottomGap <= this.options.edgeAnchorThreshold;
    const centerX = currentBounds.x + Math.round(currentBounds.width / 2);
    const centerY = currentBounds.y + Math.round(currentBounds.height / 2);
    return {
      width: nextWidth,
      height: nextHeight,
      x: isLeftAnchored ? minX : isRightAnchored ? maxX : clamp(centerX - Math.round(nextWidth / 2), minX, maxX),
      y: isTopAnchored ? minY : isBottomAnchored ? maxY : clamp(centerY - Math.round(nextHeight / 2), minY, maxY)
    };
  }

  isBottomCenterBounds(bounds: WindowLayoutBounds, workArea: WindowLayoutBounds) {
    const workBottom = workArea.y + workArea.height;
    const workCenterX = workArea.x + Math.round(workArea.width / 2);
    const boundsCenterX = bounds.x + Math.round(bounds.width / 2);
    return Math.abs(boundsCenterX - workCenterX) <= this.options.edgeAnchorThreshold
      && Math.abs(bounds.y + bounds.height - (workBottom - this.options.edgeGap)) <= this.options.edgeAnchorThreshold;
  }

  getBottomCenterMicroResizeBounds(newBounds: WindowLayoutBounds, workArea: WindowLayoutBounds): WindowLayoutBounds {
    const minimumSize = this.getMinimumSize("micro", workArea);
    const minWidth = minimumSize?.width ?? 540;
    const maxWidth = Math.max(minWidth, workArea.width - this.options.edgeGap * 2);
    const nextWidth = clamp(Math.round(newBounds.width), minWidth, maxWidth);
    const newContentBounds = this.getContentBounds(newBounds);
    const minimumContentHeight = minimumSize ? this.getContentBounds({ x: 0, y: 0, ...minimumSize }).height : this.options.microHeight;
    const nextContentHeight = newContentBounds.height < this.options.microLayoutMaximumHeight
      ? Math.max(minimumContentHeight, Math.round(newContentBounds.height))
      : this.options.microHeight;
    const nextHeight = nextContentHeight + this.options.getTitlebarHeight();
    const centerX = workArea.x + Math.round(workArea.width / 2);
    const bottom = workArea.y + workArea.height;
    return {
      width: nextWidth,
      height: nextHeight,
      x: centerX - Math.round(nextWidth / 2),
      y: bottom - nextHeight - this.options.edgeGap
    };
  }

  getMinimumSize(state: PresentationShellState, workArea: WindowLayoutBounds) {
    if (state === "settings") {
      return this.getOuterMinimumSize({
        width: Math.min(this.options.normalMinimumWidth, workArea.width),
        height: Math.min(this.options.normalMinimumHeight, this.getContentWorkArea(workArea).height)
      });
    }
    if (state === "micro" || state === "mini" || state === "normal") {
      return this.getOuterMinimumSize({ width: this.options.minimumWidth, height: this.options.minimumHeight });
    }
    return null;
  }
}
