import { useStableShellResize } from "./useStableShellResize";
import type { StableSkimRequests } from "./stableSkimTypes";
import { useStableSkimVisibility } from "./useStableSkimVisibility";

export const useStableShellLayout = (onSkimOpen: () => void, requests: StableSkimRequests) => {
  const resize = useStableShellResize();
  const visibility = useStableSkimVisibility(onSkimOpen, requests);
  return { ...resize, ...visibility };
};
