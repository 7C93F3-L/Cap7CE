import { useEffect, useRef, useState } from "react";
import { useStableShellResize } from "./useStableShellResize";

export const useStableShellLayout = (onSkimOpen: () => void) => {
  const [skimOpen, setSkimOpen] = useState(true);
  const openedSkimRef = useRef(false);
  const resize = useStableShellResize();

  useEffect(() => {
    if (openedSkimRef.current) return;
    openedSkimRef.current = true;
    onSkimOpen();
  }, [onSkimOpen]);

  return {
    ...resize,
    skimOpen,
    toggleSkim: () => setSkimOpen((open) => {
      if (!open) onSkimOpen();
      return !open;
    })
  };
};
