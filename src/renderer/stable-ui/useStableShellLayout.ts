import { useCallback, useEffect, useRef, useState } from "react";
import { useStableShellResize } from "./useStableShellResize";

export const useStableShellLayout = (onSkimOpen: () => void, skimToggleRequestId: number, skimOpenRequestId: number) => {
  const [skimOpen, setSkimOpen] = useState(false);
  const handledSkimToggleRequestIdRef = useRef(skimToggleRequestId);
  const handledSkimOpenRequestIdRef = useRef(skimOpenRequestId);
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

  useEffect(() => {
    if (handledSkimOpenRequestIdRef.current === skimOpenRequestId) return;
    handledSkimOpenRequestIdRef.current = skimOpenRequestId;
    setSkimOpen(true);
  }, [skimOpenRequestId]);

  return {
    ...resize,
    skimOpen,
    toggleSkim
  };
};
