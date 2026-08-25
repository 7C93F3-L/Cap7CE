import { useCallback, useEffect, useRef, useState } from "react";

export const useTransientFeedback = (durationMs = 3600) => {
  const [message, setMessage] = useState("");
  const timerRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setMessage("");
  }, []);

  const show = useCallback((nextMessage: string, persist = false) => {
    clear();
    setMessage(nextMessage);
    if (persist) return;

    timerRef.current = window.setTimeout(() => {
      setMessage("");
      timerRef.current = null;
    }, durationMs);
  }, [clear, durationMs]);

  useEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { message, show, clear };
};
