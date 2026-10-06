import type { SearchState } from "../../shared/types";
import type { SearchFilterDetailDomain } from "../../shared/searchFilterTypes";
import StableAudioFilters from "./StableAudioFilters";
import StableImageFilters from "./StableImageFilters";
import StableVideoFilters from "./StableVideoFilters";

const StableMediaFilters = ({ search, detailDomains, onFlyoutOpen, onSearchOptionsChange }: { search: SearchState; detailDomains?: readonly SearchFilterDetailDomain[]; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void }) => <>
  {(detailDomains === undefined || detailDomains.includes("visual")) && <StableImageFilters search={search} onFlyoutOpen={onFlyoutOpen} onSearchOptionsChange={onSearchOptionsChange} />}
  {(detailDomains === undefined || detailDomains.includes("video")) && <StableVideoFilters search={search} allowColors={detailDomains === undefined || detailDomains.includes("video-color")} onFlyoutOpen={onFlyoutOpen} onSearchOptionsChange={onSearchOptionsChange} />}
  {(detailDomains === undefined || detailDomains.includes("audio")) && <StableAudioFilters search={search} onFlyoutOpen={onFlyoutOpen} onSearchOptionsChange={onSearchOptionsChange} />}
</>;

export default StableMediaFilters;
