import type { SearchState } from "../../shared/types";
import StableAudioFilters from "./StableAudioFilters";
import StableImageFilters from "./StableImageFilters";
import StableVideoFilters from "./StableVideoFilters";

const StableMediaFilters = ({ search, onFlyoutOpen, onSearchOptionsChange }: { search: SearchState; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void }) => <>
  <StableImageFilters search={search} onFlyoutOpen={onFlyoutOpen} onSearchOptionsChange={onSearchOptionsChange} />
  <StableVideoFilters search={search} onFlyoutOpen={onFlyoutOpen} onSearchOptionsChange={onSearchOptionsChange} />
  <StableAudioFilters search={search} onFlyoutOpen={onFlyoutOpen} onSearchOptionsChange={onSearchOptionsChange} />
</>;

export default StableMediaFilters;
