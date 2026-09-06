import { useEffect, useRef, useState } from "react";

const previewSidebarStorageKey = "cap7ce.preview.sidebar-layout.v1";
export const previewSidebarExpandedWidth = 280;

const readStoredExpanded = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(previewSidebarStorageKey) ?? "null") as { expanded?: unknown } | null;
    return typeof stored?.expanded === "boolean" ? stored.expanded : true;
  } catch {
    return true;
  }
};

export const usePreviewSidebarLayout = () => {
  const initialExpandedRef = useRef<boolean | null>(null);
  if (initialExpandedRef.current === null) initialExpandedRef.current = readStoredExpanded();
  const [expanded, setExpanded] = useState(initialExpandedRef.current);

  useEffect(() => {
    try {
      window.localStorage.setItem(previewSidebarStorageKey, JSON.stringify({ expanded }));
    } catch {
      // A blocked storage backend must not prevent Preview from rendering.
    }
  }, [expanded]);

  return {
    expanded,
    toggleExpanded: () => setExpanded((current) => !current)
  };
};
