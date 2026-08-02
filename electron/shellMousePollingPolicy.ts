export interface ShellMousePoint {
  x: number;
  y: number;
}

export interface ShellMouseBounds extends ShellMousePoint {
  width: number;
  height: number;
}

export const shellMouseActivePollMs = 50;
export const shellMouseMediumPollMs = 100;
export const shellMouseIdlePollMs = 200;

export const getBottomAnchoredInteractiveBounds = (
  bounds: ShellMouseBounds,
  maximumHeight: number
): ShellMouseBounds => {
  const height = Math.max(1, Math.min(Math.floor(maximumHeight), bounds.height));
  return {
    ...bounds,
    y: bounds.y + bounds.height - height,
    height
  };
};

const nearDistancePx = 120;
const mediumDistancePx = 480;
const stationaryPollsBeforeBackoff = 4;

const distanceToBounds = (point: ShellMousePoint, bounds: ShellMouseBounds) => {
  const deltaX = point.x < bounds.x
    ? bounds.x - point.x
    : point.x >= bounds.x + bounds.width
      ? point.x - (bounds.x + bounds.width - 1)
      : 0;
  const deltaY = point.y < bounds.y
    ? bounds.y - point.y
    : point.y >= bounds.y + bounds.height
      ? point.y - (bounds.y + bounds.height - 1)
      : 0;
  return Math.hypot(deltaX, deltaY);
};

export const getShellMousePollDelay = (
  point: ShellMousePoint,
  bounds: ShellMouseBounds,
  stationaryPollCount: number
) => {
  if (stationaryPollCount < stationaryPollsBeforeBackoff) {
    return shellMouseActivePollMs;
  }
  const distance = distanceToBounds(point, bounds);
  if (distance <= nearDistancePx) return shellMouseActivePollMs;
  if (distance <= mediumDistancePx) return shellMouseMediumPollMs;
  return shellMouseIdlePollMs;
};
