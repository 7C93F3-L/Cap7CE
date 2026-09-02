import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { handlePreviewSidebarKeyboardResize, previewSidebarMaximumWidth, previewSidebarMinimumWidth } from "./previewSidebarKeyboard";

const previewSidebarStorageKey = "cap7ce.preview.sidebar-layout.v1";
export const previewSidebarDefaultWidth = 320;

const clampPreviewSidebarWidth = (width: number) => Math.min(
  previewSidebarMaximumWidth,
  Math.max(previewSidebarMinimumWidth, Math.round(width))
);

const readStoredLayout = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(previewSidebarStorageKey) ?? "null") as { expanded?: unknown; width?: unknown } | null;
    return {
      expanded: typeof stored?.expanded === "boolean" ? stored.expanded : true,
      width: typeof stored?.width === "number" ? clampPreviewSidebarWidth(stored.width) : previewSidebarDefaultWidth
    };
  } catch {
    return { expanded: true, width: previewSidebarDefaultWidth };
  }
};

export const usePreviewSidebarLayout = () => {
  const initialLayoutRef = useRef<ReturnType<typeof readStoredLayout> | null>(null);
  if (!initialLayoutRef.current) initialLayoutRef.current = readStoredLayout();
  const [expanded, setExpanded] = useState(initialLayoutRef.current.expanded);
  const [width, setWidth] = useState(initialLayoutRef.current.width);
  const resizeStartRef = useRef<{ pointerX: number; width: number } | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(previewSidebarStorageKey, JSON.stringify({ expanded, width }));
    } catch {
      // A blocked storage backend must not prevent Preview from rendering.
    }
  }, [expanded, width]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!resizeStartRef.current) return;
      setWidth(clampPreviewSidebarWidth(resizeStartRef.current.width + event.clientX - resizeStartRef.current.pointerX));
    };
    const finishResize = () => {
      if (!resizeStartRef.current) return;
      resizeStartRef.current = null;
      document.documentElement.classList.remove("is-resizing-preview-sidebar");
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      document.documentElement.classList.remove("is-resizing-preview-sidebar");
    };
  }, []);

  const beginResize = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeStartRef.current = { pointerX: event.clientX, width };
    document.documentElement.classList.add("is-resizing-preview-sidebar");
  }, [width]);

  return {
    expanded,
    width,
    toggleExpanded: () => setExpanded((current) => !current),
    beginResize,
    resizeByKeyboard: (event: ReactKeyboardEvent<HTMLElement>) => handlePreviewSidebarKeyboardResize(event, setWidth),
    resetWidth: () => setWidth(previewSidebarDefaultWidth)
  };
};
