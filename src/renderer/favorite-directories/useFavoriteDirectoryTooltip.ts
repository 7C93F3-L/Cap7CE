import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { FavoriteDirectory } from "../../shared/favoriteDirectoryTypes";

export function useFavoriteDirectoryTooltip(enabled: boolean) {
  const [state, setState] = useState<{ anchor: DOMRect; directory: FavoriteDirectory | null } | null>(null);
  const timer = useRef<number | null>(null);
  const hide = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null; setState(null);
  }, []);
  const show = (event: PointerEvent<HTMLElement>, directory: FavoriteDirectory | null) => {
    hide(); if (!enabled) return;
    const anchor = event.currentTarget.getBoundingClientRect();
    timer.current = window.setTimeout(() => { timer.current = null; setState({ anchor, directory }); }, 150);
  };
  useEffect(() => {
    window.addEventListener("blur", hide); window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("blur", hide); window.removeEventListener("resize", hide);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [hide]);
  useEffect(() => { if (!enabled) hide(); }, [enabled, hide]);
  return { state, show, hide };
}
