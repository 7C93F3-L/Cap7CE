import type { SkimDisplayMode } from "../../shared/types";

export interface StableExploreProps {
  searchDisplayMode: SkimDisplayMode;
  availableFormats: string[];
  randomBrowseEnabled: boolean;
  randomBatchNumber: number;
  randomBrowseBusy: boolean;
  onSearchDisplayModeChange: (mode: SkimDisplayMode) => void;
  onToggleRandomBrowse: () => void;
  onDisableRandomBrowse: () => void;
  onNextRandomBatch: () => void;
  onClearExploreFilters: () => void;
}
