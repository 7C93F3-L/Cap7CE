import { useCallback, useRef } from "react";

type SkimLocation = string | null;
type LoadSkimLocation = (path: SkimLocation) => Promise<boolean>;

interface SkimHistoryState {
  locations: SkimLocation[];
  index: number;
}

export const useSkimNavigationHistory = (loadLocation: LoadSkimLocation) => {
  const loadLocationRef = useRef(loadLocation);
  const historyRef = useRef<SkimHistoryState>({ locations: [null], index: 0 });
  const navigationRequestRef = useRef(0);
  loadLocationRef.current = loadLocation;

  const navigate = useCallback((target: SkimLocation, commit: () => void) => {
    const requestId = ++navigationRequestRef.current;
    void loadLocationRef.current(target).then((loaded) => {
      if (!loaded || navigationRequestRef.current !== requestId) return;
      commit();
    });
  }, []);

  const open = useCallback((target: SkimLocation) => {
    navigate(target, () => {
      const history = historyRef.current;
      if (history.locations[history.index] === target) return;
      history.locations = [...history.locations.slice(0, history.index + 1), target];
      history.index = history.locations.length - 1;
    });
  }, [navigate]);

  const back = useCallback(() => {
    const history = historyRef.current;
    const targetIndex = history.index - 1;
    if (targetIndex < 0) return;
    navigate(history.locations[targetIndex], () => {
      historyRef.current.index = targetIndex;
    });
  }, [navigate]);

  const forward = useCallback(() => {
    const history = historyRef.current;
    const targetIndex = history.index + 1;
    if (targetIndex >= history.locations.length) return;
    navigate(history.locations[targetIndex], () => {
      historyRef.current.index = targetIndex;
    });
  }, [navigate]);

  return { open, back, forward };
};
