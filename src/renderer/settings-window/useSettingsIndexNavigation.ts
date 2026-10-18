import { useCallback, useEffect, useRef, useState } from "react";

export function useSettingsIndexNavigation(onOpen: () => void) {
  const [open, setOpen] = useState(false);
  const guard = useRef<((proceed: () => void) => void) | null>(null), callback = useRef(onOpen);
  const initialRequest = useRef<Promise<boolean> | null>(null);
  callback.current = onOpen;
  const show = useCallback(() => { callback.current(); setOpen(true); }, []);
  const navigate = useCallback((action: () => void = () => {}) => {
    const proceed = () => { setOpen(false); action(); };
    if (guard.current) guard.current(proceed); else proceed();
  }, []);
  const protect = useCallback((handler: (proceed: () => void) => void) => {
    guard.current = handler; return () => { if (guard.current === handler) guard.current = null; };
  }, []);
  useEffect(() => {
    let active = true;
    const api = window.cap7ce?.settingsWindow;
    const apply = async (request: Promise<boolean>) => { try { if (await request && active) show(); } catch { /* A manual entry remains available. */ } };
    const read = () => api?.consumeMetadataBuildRequest?.() ?? Promise.resolve(false);
    const unsubscribe = api?.onMetadataBuildRequested?.(() => void apply(read()));
    // React StrictMode repeats effects; both initial observers must see the same request result.
    void apply(initialRequest.current ??= read());
    return () => { active = false; unsubscribe?.(); };
  }, [show]);
  return { open, show, navigate, protect };
}
export type SettingsIndexNavigation = ReturnType<typeof useSettingsIndexNavigation>;
