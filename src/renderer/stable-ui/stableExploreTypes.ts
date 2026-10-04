import type { SkimDisplayMode } from "../../shared/types";

export interface StableExploreProps {
  searchDisplayMode: SkimDisplayMode;
  onSearchDisplayModeChange: (mode: SkimDisplayMode) => void;
}
