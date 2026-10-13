import { useCallback, useEffect, useRef, useState } from "react";
import type { ComputerSearchSort } from "../../shared/computerSearchFactTypes";
import type { ComputerSearchController } from "../computer-search/useComputerSearchController";

export function useCatalogViewOptions() {
  const [sort, setSort] = useState<ComputerSearchSort>("name-ascending");
  const [showHidden, setShowHidden] = useState(false);
  return { sort, setSort, showHidden, toggleHidden: () => setShowHidden(value => !value), options: { sort, excludeHidden: !showHidden } };
}

export function useCatalogRefresh(controller: ComputerSearchController, atHome: boolean, foreground: boolean, path: string | null) {
  const [version, setVersion] = useState(0), [busy, setBusy] = useState(false);
  const state = useRef({ controller, atHome, foreground, path }); state.current = { controller, atHome, foreground, path };
  const live = useRef(true); useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    const current = state.current, controller = current.controller;
    if (!current.foreground || inFlight.current || controller.busy || controller.interactionBlocked) return false;
    inFlight.current = true; setBusy(true);
    try {
      const status = await controller.refreshStatus();
      if (!live.current || state.current.path !== current.path || state.current.controller.taskId !== controller.taskId || !state.current.foreground || state.current.atHome !== current.atHome) return false;
      if (current.atHome) { setVersion(value => value + 1); return status !== null; }
      if (controller.taskId && controller.hasSubmitted) return await controller.refreshResults() === "applied";
      if (!status?.searchAvailable) return false;
      await controller.submit(); return true;
    } finally { inFlight.current = false; if (live.current) setBusy(false); }
  }, []);
  return { refresh, version, busy };
}
