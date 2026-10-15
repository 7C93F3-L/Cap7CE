export function stableSidebarFlyoutPosition(anchor: Pick<DOMRect, "right" | "top">,
  width: number, height: number, viewportWidth: number, viewportHeight: number) {
  return {
    left: Math.max(5, Math.min(anchor.right + 5, viewportWidth - width - 5)),
    top: Math.max(45, Math.min(anchor.top, viewportHeight - height - 5))
  };
}
