import { useCallback, useEffect, useRef, useState } from "react";
import { useStableShellResize } from "./useStableShellResize";

export const useStableShellLayout = (onSkimOpen: () => void, skimToggleRequestId: number) => {
  const [skimOpen, setSkimOpen] = useState(false);
  const handledSkimToggleRequestIdRef = useRef(skimToggleRequestId);
  const resize = useStableShellResize();
  const toggleSkim = useCallback(() => setSkimOpen((open) => {
    if (!open) onSkimOpen();
    return !open;
  }), [onSkimOpen]);

  useEffect(() => {
    if (handledSkimToggleRequestIdRef.current === skimToggleRequestId) return;
    handledSkimToggleRequestIdRef.current = skimToggleRequestId;
    toggleSkim();
  }, [skimToggleRequestId, toggleSkim]);

  return {
    ...resize,
    skimOpen,
    toggleSkim
  };
};
