import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, SetStateAction } from "react";

export const previewSidebarMinimumWidth = 280;
export const previewSidebarMaximumWidth = 420;

export const handlePreviewSidebarKeyboardResize = (
  event: ReactKeyboardEvent<HTMLElement>,
  updateWidth: Dispatch<SetStateAction<number>>
) => {
  if (!new Set(["Home", "End", "ArrowLeft", "ArrowRight"]).has(event.key)) return;
  event.preventDefault();
  updateWidth((currentWidth) => event.key === "Home"
    ? previewSidebarMinimumWidth
    : event.key === "End"
      ? previewSidebarMaximumWidth
      : event.key === "ArrowLeft"
        ? Math.max(previewSidebarMinimumWidth, currentWidth - 8)
        : Math.min(previewSidebarMaximumWidth, currentWidth + 8));
};
