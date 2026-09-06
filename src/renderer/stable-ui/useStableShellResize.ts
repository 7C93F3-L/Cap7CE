import { useEffect, useState, type CSSProperties, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import { stableSidebarDefaultWidth, stableSkimDefaultWidth, useStableShellSizeMemory } from "./useStableShellSizeMemory";
const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum); const resizeStep = 8;
const resolveKeyboardWidth = (
  event: ReactKeyboardEvent<HTMLButtonElement>,
  current: number,
  minimum: number,
  maximum: number,
  leftDelta: number
) => {
  if (event.key === "Home") return minimum;
  if (event.key === "End") return maximum;
  if (event.key === "ArrowLeft") return clamp(current + leftDelta, minimum, maximum);
  if (event.key === "ArrowRight") return clamp(current - leftDelta, minimum, maximum);
  return null;
};
export const useStableShellResize = () => {
  const { sidebarWidth, skimWidth, setSidebarWidth, setSkimWidth } = useStableShellSizeMemory();
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  useEffect(() => { const updateViewportWidth = () => setViewportWidth(window.innerWidth); window.addEventListener("resize", updateViewportWidth); return () => window.removeEventListener("resize", updateViewportWidth); }, []);
  const skimMaximumWidth = Math.max(280, Math.floor((viewportWidth - sidebarWidth) / 2));
  const resizeByKeyboard = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    minimum: number,
    maximum: number,
    leftDelta: number,
    update: Dispatch<SetStateAction<number>>
  ) => {
    if (!new Set(["Home", "End", "ArrowLeft", "ArrowRight"]).has(event.key)) return;
    event.preventDefault();
    update((current) => resolveKeyboardWidth(event, current, minimum, maximum, leftDelta) ?? current);
  };
  return {
    shellStyle: {
      "--cap-stable-sidebar-width": `${sidebarWidth}px`,
      "--cap-stable-skim-width": `${skimWidth}px`, "--cap-stable-skim-maximum-width": `${skimMaximumWidth}px`
    } as CSSProperties,
    sidebarWidth,
    skimWidth: Math.min(skimWidth, skimMaximumWidth), skimMaximumWidth,
    resizeSidebar: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) setSidebarWidth(clamp(event.clientX, 40, 320));
    },
    resizeSkim: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) setSkimWidth(clamp(window.innerWidth - event.clientX, 280, skimMaximumWidth));
    },
    resizeSidebarByKeyboard: (event: ReactKeyboardEvent<HTMLButtonElement>) => resizeByKeyboard(event, 40, 320, -resizeStep, setSidebarWidth),
    resizeSkimByKeyboard: (event: ReactKeyboardEvent<HTMLButtonElement>) => resizeByKeyboard(event, 280, skimMaximumWidth, resizeStep, setSkimWidth),
    resetSidebarWidth: () => setSidebarWidth(stableSidebarDefaultWidth),
    resetSkimWidth: () => setSkimWidth(stableSkimDefaultWidth)
  };
};
