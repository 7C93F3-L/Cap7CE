import { useEffect, useRef, useState } from "react";

export function useMetadataBuildNavigation() {
  const [error, setError] = useState(false), live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const open = () => {
    setError(false);
    void Promise.resolve(window.cap7ce?.settingsWindow?.openMetadataBuild?.()).then(opened => { if (live.current) setError(!opened); }).catch(() => { if (live.current) setError(true); });
  };
  return { open, error, dismiss: () => setError(false) };
}
