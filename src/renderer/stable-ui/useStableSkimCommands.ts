import { useCallback, useState } from "react";
import type { StableSkimRequests } from "./stableSkimTypes";

export const useStableSkimCommands = (
  openLocation: (path: string | null) => void,
  currentPath: string | null
) => {
  const [requests, setRequests] = useState<StableSkimRequests>({ toggleId: 0, openId: 0 });
  const requestOpen = useCallback((path: string | null) => {
    void openLocation(path);
    setRequests((current) => ({ ...current, openId: current.openId + 1 }));
  }, [openLocation]);
  return {
    requests,
    openCurrent: useCallback(() => requestOpen(currentPath), [currentPath, requestOpen]),
    openRoot: useCallback(() => requestOpen(null), [requestOpen]),
    requestToggle: useCallback(() => setRequests((current) => ({ ...current, toggleId: current.toggleId + 1 })), [])
  };
};
