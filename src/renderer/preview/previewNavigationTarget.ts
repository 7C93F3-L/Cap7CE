export const isPreviewNavigationSuppressedTarget = (target: EventTarget | null) => (
  target instanceof Element
  && Boolean(target.closest("[data-preview-navigation-suppressed='true'], .context-menu, input, textarea, select, [contenteditable='true']"))
);

export const getPreviewWheelNavigationDirection = (deltaX: number, deltaY: number): -1 | 0 | 1 => {
  const delta = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;
  return delta === 0 ? 0 : delta > 0 ? 1 : -1;
};
