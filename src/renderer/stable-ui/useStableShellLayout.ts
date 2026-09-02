import { useState } from "react";
import { useStableShellResize } from "./useStableShellResize";

export const useStableShellLayout = (onSkimOpen: () => void) => {
  const [skimOpen, setSkimOpen] = useState(false);
  const resize = useStableShellResize();

  return {
    ...resize,
    skimOpen,
    toggleSkim: () => setSkimOpen((open) => {
      if (!open) onSkimOpen();
      return !open;
    })
  };
};
