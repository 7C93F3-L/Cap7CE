import type {
  WindowDockEdge,
  WindowLayoutBounds,
  WindowLayoutDisplaySnapshot,
  WindowLayoutProfile
} from "./windowLayoutTypes";

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(Math.max(value, minimum), maximum)
);

const rectangleCenter = (bounds: WindowLayoutBounds) => ({
  x: bounds.x + bounds.width / 2,
  y: bounds.y + bounds.height / 2
});

const intersectionArea = (first: WindowLayoutBounds, second: WindowLayoutBounds) => {
  const width = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
  const height = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
  return width * height;
};

const normalizedTravelPosition = (
  coordinate: number,
  sourceStart: number,
  sourceSpan: number,
  sourceSize: number
) => {
  const available = sourceSpan - sourceSize;
  return available > 0 ? clamp((coordinate - sourceStart) / available, 0, 1) : 0.5;
};

const mapTravelPosition = (ratio: number, targetStart: number, targetSpan: number, targetSize: number) => (
  targetStart + Math.round(Math.max(0, targetSpan - targetSize) * ratio)
);

export const selectWindowLayoutDisplay = (
  displays: WindowLayoutDisplaySnapshot[],
  profile: WindowLayoutProfile
) => {
  if (displays.length === 0) return null;
  const matchingDisplay = displays.find((display) => display.id === profile.displayId);
  if (matchingDisplay) return matchingDisplay;

  let bestIntersection = 0;
  let intersectionDisplay: WindowLayoutDisplaySnapshot | null = null;
  for (const display of displays) {
    const area = intersectionArea(profile.expandedBounds, display.bounds);
    if (area > bestIntersection) {
      bestIntersection = area;
      intersectionDisplay = display;
    }
  }
  if (intersectionDisplay) return intersectionDisplay;

  const savedCenter = rectangleCenter(profile.expandedBounds);
  return displays.reduce((nearest, display) => {
    const nearestCenter = rectangleCenter(nearest.bounds);
    const displayCenter = rectangleCenter(display.bounds);
    const nearestDistance = (nearestCenter.x - savedCenter.x) ** 2 + (nearestCenter.y - savedCenter.y) ** 2;
    const displayDistance = (displayCenter.x - savedCenter.x) ** 2 + (displayCenter.y - savedCenter.y) ** 2;
    return displayDistance < nearestDistance ? display : nearest;
  });
};

export const clampWindowLayoutBounds = (
  bounds: WindowLayoutBounds,
  workArea: WindowLayoutBounds,
  minimumSize: { width: number; height: number } = { width: 1, height: 1 },
  maximumSize: { width?: number; height?: number } = {}
): WindowLayoutBounds => {
  const maximumWidth = Math.min(workArea.width, maximumSize.width ?? workArea.width);
  const maximumHeight = Math.min(workArea.height, maximumSize.height ?? workArea.height);
  const width = Math.min(maximumWidth, Math.max(Math.min(minimumSize.width, maximumWidth), Math.round(bounds.width)));
  const height = Math.min(maximumHeight, Math.max(Math.min(minimumSize.height, maximumHeight), Math.round(bounds.height)));
  return {
    x: clamp(Math.round(bounds.x), workArea.x, workArea.x + workArea.width - width),
    y: clamp(Math.round(bounds.y), workArea.y, workArea.y + workArea.height - height),
    width,
    height
  };
};

export const detectWindowDockEdge = (
  bounds: WindowLayoutBounds,
  workArea: WindowLayoutBounds,
  threshold: number,
  preferredEdge: WindowDockEdge | null = null,
  excludedEdges: readonly WindowDockEdge[] = []
): WindowDockEdge | null => {
  const edgeGaps: Array<{ edge: WindowDockEdge; gap: number }> = [
    { edge: "left", gap: Math.abs(bounds.x - workArea.x) },
    { edge: "right", gap: Math.abs(workArea.x + workArea.width - bounds.x - bounds.width) },
    { edge: "top", gap: Math.abs(bounds.y - workArea.y) },
    { edge: "bottom", gap: Math.abs(workArea.y + workArea.height - bounds.y - bounds.height) }
  ];
  const gaps = edgeGaps.filter(({ edge, gap }) => gap <= threshold && !excludedEdges.includes(edge));
  if (gaps.length === 0) return null;
  const minimumGap = Math.min(...gaps.map(({ gap }) => gap));
  const nearestEdges = gaps.filter(({ gap }) => gap === minimumGap);
  if (preferredEdge && nearestEdges.some(({ edge }) => edge === preferredEdge)) return preferredEdge;
  return nearestEdges[0]?.edge ?? null;
};

export const inferTaskbarEdge = (
  displayBounds: WindowLayoutBounds,
  workArea: WindowLayoutBounds
): WindowDockEdge | null => {
  const insets: Array<{ edge: WindowDockEdge; inset: number }> = [
    { edge: "left", inset: workArea.x - displayBounds.x },
    { edge: "right", inset: displayBounds.x + displayBounds.width - workArea.x - workArea.width },
    { edge: "top", inset: workArea.y - displayBounds.y },
    { edge: "bottom", inset: displayBounds.y + displayBounds.height - workArea.y - workArea.height }
  ];
  const maximumInset = Math.max(...insets.map(({ inset }) => inset));
  return maximumInset > 0 ? insets.find(({ inset }) => inset === maximumInset)?.edge ?? null : null;
};

export const getEdgeAnchoredCapsuleBounds = (
  workArea: WindowLayoutBounds,
  size: { width: number; height: number },
  edge: "top" | "bottom",
  gap: number
): WindowLayoutBounds => clampWindowLayoutBounds({
  width: size.width,
  height: size.height,
  x: workArea.x + Math.round((workArea.width - size.width) / 2),
  y: edge === "top"
    ? workArea.y + gap
    : workArea.y + workArea.height - gap - size.height
}, workArea, size);

export const getDirectionalLineBounds = (
  workArea: WindowLayoutBounds,
  edge: WindowDockEdge,
  length: number,
  interactionThickness: number,
  gap: number
): WindowLayoutBounds => {
  if (edge === "left" || edge === "right") {
    return {
      width: interactionThickness,
      height: Math.min(length, workArea.height),
      x: edge === "left"
        ? workArea.x + gap
        : workArea.x + workArea.width - gap - interactionThickness,
      y: workArea.y + Math.round((workArea.height - Math.min(length, workArea.height)) / 2)
    };
  }
  return {
    width: Math.min(length, workArea.width),
    height: interactionThickness,
    x: workArea.x + Math.round((workArea.width - Math.min(length, workArea.width)) / 2),
    y: edge === "top"
      ? workArea.y + gap
      : workArea.y + workArea.height - gap - interactionThickness
  };
};

export const getDirectionalLineShape = (
  windowBounds: WindowLayoutBounds,
  edge: WindowDockEdge,
  interactionThickness: number
): WindowLayoutBounds => {
  const thickness = Math.min(
    Math.max(1, Math.round(interactionThickness)),
    edge === "left" || edge === "right" ? windowBounds.width : windowBounds.height
  );
  if (edge === "left" || edge === "right") {
    return {
      x: edge === "left" ? 0 : windowBounds.width - thickness,
      y: 0,
      width: thickness,
      height: windowBounds.height
    };
  }
  return {
    x: 0,
    y: edge === "top" ? 0 : windowBounds.height - thickness,
    width: windowBounds.width,
    height: thickness
  };
};

export const resolveRememberedWindowBounds = ({
  defaultBounds,
  profile,
  targetWorkArea,
  rememberLayout,
  minimumSize,
  maximumSize,
  edgeGap = 5,
  fixedHeight
}: {
  defaultBounds: WindowLayoutBounds;
  profile: WindowLayoutProfile | null;
  targetWorkArea: WindowLayoutBounds;
  rememberLayout: boolean;
  minimumSize: { width: number; height: number };
  maximumSize?: { width?: number; height?: number };
  edgeGap?: number;
  fixedHeight?: number;
}): WindowLayoutBounds => {
  if (!profile || !rememberLayout) {
    return clampWindowLayoutBounds(defaultBounds, targetWorkArea, minimumSize, maximumSize);
  }

  const sourceBounds = profile.expandedBounds;
  const sourceWorkArea = profile.workAreaSnapshot;
  const width = sourceBounds.width;
  const height = fixedHeight ?? sourceBounds.height;
  const xRatio = normalizedTravelPosition(sourceBounds.x, sourceWorkArea.x, sourceWorkArea.width, sourceBounds.width);
  const yRatio = normalizedTravelPosition(sourceBounds.y, sourceWorkArea.y, sourceWorkArea.height, sourceBounds.height);
  let x = mapTravelPosition(xRatio, targetWorkArea.x, targetWorkArea.width, width);
  let y = mapTravelPosition(yRatio, targetWorkArea.y, targetWorkArea.height, height);
  if (profile.dockEdge === "left") x = targetWorkArea.x + edgeGap;
  if (profile.dockEdge === "right") x = targetWorkArea.x + targetWorkArea.width - width - edgeGap;
  if (profile.dockEdge === "top") y = targetWorkArea.y + edgeGap;
  if (profile.dockEdge === "bottom") y = targetWorkArea.y + targetWorkArea.height - height - edgeGap;

  return clampWindowLayoutBounds({ x, y, width, height }, targetWorkArea, minimumSize, maximumSize);
};
