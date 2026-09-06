import { useEffect, useRef, useState } from "react";

const stableShellSizeStorageKey = "cap7ce.main.shell-sizes.v1";
const stableSkimStoredMaximumWidth = 4096;
export const stableSidebarDefaultWidth = 176;
export const stableSkimDefaultWidth = 360;

interface StableShellSizes { sidebarWidth: number; skimWidth: number; }
const defaultSizes = (): StableShellSizes => ({ sidebarWidth: stableSidebarDefaultWidth, skimWidth: stableSkimDefaultWidth });
const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(Math.round(value), minimum), maximum);

const readStoredSizes = (): StableShellSizes => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(stableShellSizeStorageKey) ?? "null") as Partial<StableShellSizes> | null;
    return {
      sidebarWidth: typeof stored?.sidebarWidth === "number" && Number.isFinite(stored.sidebarWidth)
        ? clamp(stored.sidebarWidth, 40, 320) : stableSidebarDefaultWidth,
      skimWidth: typeof stored?.skimWidth === "number" && Number.isFinite(stored.skimWidth)
        ? clamp(stored.skimWidth, 280, stableSkimStoredMaximumWidth) : stableSkimDefaultWidth
    };
  } catch {
    return defaultSizes();
  }
};

export const useStableShellSizeMemory = () => {
  const initialWidthsRef = useRef<StableShellSizes | null>(null);
  if (!initialWidthsRef.current) initialWidthsRef.current = readStoredSizes();
  const [sidebarWidth, setSidebarWidth] = useState(initialWidthsRef.current.sidebarWidth);
  const [skimWidth, setSkimWidth] = useState(initialWidthsRef.current.skimWidth);

  useEffect(() => {
    const saveTimer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(stableShellSizeStorageKey, JSON.stringify({ sidebarWidth, skimWidth }));
      } catch {
        // A blocked storage backend must not prevent the main shell from rendering.
      }
    }, 180);
    return () => window.clearTimeout(saveTimer);
  }, [sidebarWidth, skimWidth]);

  return { sidebarWidth, skimWidth, setSidebarWidth, setSkimWidth };
};
