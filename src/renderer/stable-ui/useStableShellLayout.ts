import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);

export const useStableShellLayout = (onSkimOpen: () => void) => {
  const [sidebarWidth, setSidebarWidth] = useState(160);
  const [skimWidth, setSkimWidth] = useState(360);
  const [skimOpen, setSkimOpen] = useState(true);
  const openedSkimRef = useRef(false);
  const shellStyle = {
    "--cap-stable-sidebar-width": `${sidebarWidth}px`,
    "--cap-stable-skim-width": `${skimWidth}px`
  } as CSSProperties;

  useEffect(() => {
    if (openedSkimRef.current) return;
    openedSkimRef.current = true;
    onSkimOpen();
  }, [onSkimOpen]);

  return {
    shellStyle,
    skimOpen,
    resizeSidebar: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) setSidebarWidth(clamp(event.clientX, 40, 320));
    },
    resizeSkim: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) setSkimWidth(clamp(window.innerWidth - event.clientX, 280, 480));
    },
    resetSidebarWidth: () => setSidebarWidth(160),
    resetSkimWidth: () => setSkimWidth(360),
    toggleSkim: () => setSkimOpen((open) => {
      if (!open) onSkimOpen();
      return !open;
    })
  };
};
