import { useCallback, useEffect, useState, type SyntheticEvent } from "react";

type StableKeyboardRegion = "results" | "skim";

export const useStableKeyboardRegion = (skimOpen: boolean) => {
  const [keyboardRegion, setKeyboardRegion] = useState<StableKeyboardRegion>("results");
  useEffect(() => setKeyboardRegion(skimOpen ? "skim" : "results"), [skimOpen]);
  const activateKeyboardRegion = useCallback((event: SyntheticEvent<HTMLElement>) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(".cap-stable-skim-slot")) setKeyboardRegion("skim");
    else if (event.target.closest(".cap-stable-results-slot")) setKeyboardRegion("results");
  }, []);
  return [!skimOpen || keyboardRegion === "results", skimOpen && keyboardRegion === "skim", activateKeyboardRegion] as const;
};
