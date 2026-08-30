import type { WindowLayoutBounds } from "./windowLayoutTypes";

export type WindowContentVerticalAnchor = "top" | "center" | "bottom";

const normalizeTitlebarHeight = (titlebarHeight: number) => (
  Number.isFinite(titlebarHeight) ? Math.max(0, Math.round(titlebarHeight)) : 0
);

export const toWindowOuterBounds = (
  contentBounds: WindowLayoutBounds,
  titlebarHeight: number,
  anchor: WindowContentVerticalAnchor = "top"
): WindowLayoutBounds => {
  const heightDelta = normalizeTitlebarHeight(titlebarHeight);
  const yDelta = anchor === "bottom"
    ? heightDelta
    : anchor === "center"
      ? Math.round(heightDelta / 2)
      : 0;
  return {
    ...contentBounds,
    y: contentBounds.y - yDelta,
    height: contentBounds.height + heightDelta
  };
};

export const toWindowContentBounds = (
  outerBounds: WindowLayoutBounds,
  titlebarHeight: number
): WindowLayoutBounds => {
  const heightDelta = normalizeTitlebarHeight(titlebarHeight);
  return {
    ...outerBounds,
    y: outerBounds.y + heightDelta,
    height: Math.max(1, outerBounds.height - heightDelta)
  };
};

export const toWindowOuterMinimumSize = (
  contentSize: Pick<WindowLayoutBounds, "width" | "height">,
  titlebarHeight: number
) => ({
  width: contentSize.width,
  height: contentSize.height + normalizeTitlebarHeight(titlebarHeight)
});

export const toWindowContentWorkArea = (
  workArea: WindowLayoutBounds,
  titlebarHeight: number
): WindowLayoutBounds => {
  const heightDelta = normalizeTitlebarHeight(titlebarHeight);
  return {
    ...workArea,
    y: workArea.y + heightDelta,
    height: Math.max(1, workArea.height - heightDelta)
  };
};
