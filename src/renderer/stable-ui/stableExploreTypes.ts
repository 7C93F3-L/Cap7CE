import type { SkimDisplayMode } from "../../shared/types";

export interface StableExploreProps {
  searchDisplayMode: SkimDisplayMode;
  availableFormats: string[];
  onSearchDisplayModeChange: (mode: SkimDisplayMode) => void;
}
