import { useCallback, useEffect, useRef, useState } from "react";
import type { StableSkimRequests } from "./stableSkimTypes";

export const useStableSkimVisibility = (onSkimOpen: () => void, requests: StableSkimRequests) => {
  const [skimOpen, setSkimOpen] = useState(false);
  const handledToggleIdRef = useRef(requests.toggleId);
  const handledOpenIdRef = useRef(requests.openId);
  const toggleSkim = useCallback(() => setSkimOpen((open) => {
    if (!open) onSkimOpen();
    return !open;
  }), [onSkimOpen]);

  useEffect(() => {
    if (handledToggleIdRef.current === requests.toggleId) return;
    handledToggleIdRef.current = requests.toggleId;
    toggleSkim();
  }, [requests.toggleId, toggleSkim]);

  useEffect(() => {
    if (handledOpenIdRef.current === requests.openId) return;
    handledOpenIdRef.current = requests.openId;
    setSkimOpen(true);
  }, [requests.openId]);

  return { skimOpen, toggleSkim };
};
