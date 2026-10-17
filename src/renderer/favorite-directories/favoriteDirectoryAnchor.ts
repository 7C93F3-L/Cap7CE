export function favoriteDirectoryAnchor(trigger: HTMLElement): DOMRect {
  const bounds = trigger.getBoundingClientRect(), sidebar = trigger.closest(".cap-catalog-sidebar");
  if (!sidebar) return bounds;
  const row = trigger.closest(".cap-favorite-row")?.getBoundingClientRect() ?? bounds;
  return new DOMRect(row.left, row.top, Math.max(0, sidebar.getBoundingClientRect().right - row.left), row.height);
}
