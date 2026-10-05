import { useEffect, useRef } from "react";
import type { StableSkimRequests } from "../stable-ui/stableSkimTypes";

export const useWorkspaceSkimRequests = (requests: StableSkimRequests, open: () => void, toggle: () => void) => {
  const handled = useRef(requests);
  useEffect(() => {
    const previous = handled.current;
    handled.current = requests;
    if (previous.openId !== requests.openId) open();
    else if (previous.toggleId !== requests.toggleId) toggle();
  }, [requests.openId, requests.toggleId, open, toggle]);
};
