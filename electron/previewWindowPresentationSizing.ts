import type { Rectangle } from "electron";
import { toWindowOuterMinimumSize } from "./windowPresentationGeometry";

interface PreviewWindowPresentationSizingOptions {
  minimumWidth: number;
  minimumHeight: number;
  horizontalPadding: number;
  verticalChrome: number;
  workAreaRatio: number;
}

export class PreviewWindowPresentationSizing {
  constructor(private readonly options: PreviewWindowPresentationSizingOptions) {}

  getOuterMinimumSize(titlebarHeight: number) {
    return toWindowOuterMinimumSize({ width: this.options.minimumWidth, height: this.options.minimumHeight }, titlebarHeight);
  }

  resolveBounds({
    contentWidth,
    contentHeight,
    currentBounds,
    workArea,
    titlebarHeight
  }: {
    contentWidth: number;
    contentHeight: number;
    currentBounds: Rectangle | null;
    workArea: Rectangle;
    titlebarHeight: number;
  }): Rectangle {
    const safeTitlebarHeight = Number.isFinite(titlebarHeight) ? Math.max(0, Math.round(titlebarHeight)) : 0;
    const maximumWidth = Math.max(1, Math.floor(workArea.width * this.options.workAreaRatio));
    const maximumContentHeight = Math.max(1, Math.min(
      Math.floor(workArea.height * this.options.workAreaRatio),
      workArea.height - safeTitlebarHeight
    ));
    const minimumWidth = Math.min(this.options.minimumWidth, maximumWidth);
    const minimumContentHeight = Math.min(this.options.minimumHeight, maximumContentHeight);
    const availableContentWidth = Math.max(1, maximumWidth - this.options.horizontalPadding);
    const availableContentHeight = Math.max(1, maximumContentHeight - this.options.verticalChrome);
    const safeContentWidth = Math.max(1, Math.round(contentWidth));
    const safeContentHeight = Math.max(1, Math.round(contentHeight));
    const scale = Math.min(1, availableContentWidth / safeContentWidth, availableContentHeight / safeContentHeight);
    const width = Math.min(maximumWidth, Math.max(minimumWidth, Math.round(safeContentWidth * scale) + this.options.horizontalPadding));
    const contentWindowHeight = Math.min(maximumContentHeight, Math.max(minimumContentHeight, Math.round(safeContentHeight * scale) + this.options.verticalChrome));
    const height = contentWindowHeight + safeTitlebarHeight;
    const anchorX = currentBounds ? currentBounds.x + Math.round(currentBounds.width / 2) : workArea.x + Math.round(workArea.width / 2);
    const anchorY = currentBounds ? currentBounds.y + Math.round(currentBounds.height / 2) : workArea.y + Math.round(workArea.height / 2);
    const maximumX = Math.max(workArea.x, workArea.x + workArea.width - width);
    const maximumY = Math.max(workArea.y, workArea.y + workArea.height - height);
    const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
    return {
      x: clamp(anchorX - Math.round(width / 2), workArea.x, maximumX),
      y: clamp(anchorY - Math.round(height / 2), workArea.y, maximumY),
      width,
      height
    };
  }
}
