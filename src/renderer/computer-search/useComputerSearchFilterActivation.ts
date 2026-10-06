import { useEffect, useRef } from "react";
import type { ComputerSearchConditions } from "../../shared/computerSearchFactTypes";

export const useComputerSearchFilterActivation = (conditions: ComputerSearchConditions | undefined, foreground: boolean, enter: () => void) => {
  const key = JSON.stringify(conditions ?? {}), previous = useRef("");
  useEffect(() => {
    if (!foreground || previous.current === key) return;
    previous.current = key;
    if (key !== "{}") enter();
  }, [foreground, key, enter]);
};
