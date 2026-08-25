import { useCallback, useEffect, useState } from "react";

export const useAlwaysOnTopController = () => {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);

  const applyAlwaysOnTop = useCallback((enabled: boolean) => {
    setIsAlwaysOnTop(enabled);
  }, []);

  const syncAlwaysOnTop = useCallback(async () => {
    const state = await window.cap7ce?.window.getAlwaysOnTop();
    if (state) {
      setIsAlwaysOnTop(state.actual);
    }
  }, []);

  const setAlwaysOnTop = useCallback(async (enabled: boolean) => {
    const state = await window.cap7ce?.window.setAlwaysOnTop(enabled);
    if (state) {
      setIsAlwaysOnTop(state.actual);
    }
    return state;
  }, []);

  const toggleAlwaysOnTop = useCallback(async (mode: string) => {
    const requested = !isAlwaysOnTop;
    const state = await setAlwaysOnTop(requested);
    if (state) {
      console.debug("[alwaysOnTop:toggle]", {
        requested,
        actual: state.actual,
        mode
      });
    }
  }, [isAlwaysOnTop, setAlwaysOnTop]);

  useEffect(() => {
    const unsubscribe = window.cap7ce?.window.onAlwaysOnTopChanged?.((enabled) => {
      setIsAlwaysOnTop(enabled);
    });
    return () => unsubscribe?.();
  }, []);

  return {
    isAlwaysOnTop,
    applyAlwaysOnTop,
    syncAlwaysOnTop,
    setAlwaysOnTop,
    toggleAlwaysOnTop
  };
};
