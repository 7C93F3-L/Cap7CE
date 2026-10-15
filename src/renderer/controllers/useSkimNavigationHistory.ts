import { useCallback, useEffect, useRef, useState } from "react";

type SkimLocation = string | null;
interface SkimHistoryState<Location> {
  locations: Location[];
  index: number;
}

export const useSkimNavigationHistory = <Location = SkimLocation>(
  loadLocation: (path: Location) => Promise<boolean>, initialLocation: Location = null as Location
) => {
  const loadLocationRef = useRef(loadLocation);
  const historyRef = useRef<SkimHistoryState<Location>>({ locations: [initialLocation], index: 0 });
  const [, setRevision] = useState(0);
  const navigationRequestRef = useRef(0);
  loadLocationRef.current = loadLocation;
  useEffect(() => () => { navigationRequestRef.current++; }, []);

  const navigate = useCallback((target: Location, commit: () => void) => {
    const requestId = ++navigationRequestRef.current;
    void loadLocationRef.current(target).then((loaded) => {
      if (!loaded || navigationRequestRef.current !== requestId) return;
      commit();
      setRevision(value => value + 1);
    });
  }, []);

  const open = useCallback((target: Location) => {
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

  const mapLocations = useCallback((transform: (location: Location) => Location) => {
    navigationRequestRef.current++;
    historyRef.current.locations = historyRef.current.locations.map(transform);
    setRevision(value => value + 1);
  }, []);
  return { open, back, forward, mapLocations, canBack: historyRef.current.index > 0,
    canForward: historyRef.current.index + 1 < historyRef.current.locations.length };
};
