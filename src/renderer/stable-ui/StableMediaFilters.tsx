import type { SearchState } from "../../shared/types";
import type { SearchFilterDetailDomain } from "../../shared/searchFilterTypes";
import StableAudioFilters from "./StableAudioFilters";
import StableImageFilters from "./StableImageFilters";
import StableVideoFilters from "./StableVideoFilters";

const StableMediaFilters = ({ search, detailDomains, metadataColorsDisabled = false, onFlyoutOpen, onSearchOptionsChange }: { search: SearchState; detailDomains?: readonly SearchFilterDetailDomain[]; metadataColorsDisabled?: boolean; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void }) => <>
  {(detailDomains === undefined || detailDomains.includes("visual")) && <StableImageFilters colorsDisabled={metadataColorsDisabled} search={search} onFlyoutOpen={onFlyoutOpen} onSearchOptionsChange={onSearchOptionsChange} />}
  {(detailDomains === undefined || detailDomains.includes("video")) && <StableVideoFilters colorsDisabled={metadataColorsDisabled} search={search} allowColors={detailDomains === undefined || detailDomains.includes("video-color")} onFlyoutOpen={onFlyoutOpen} onSearchOptionsChange={onSearchOptionsChange} />}
  {(detailDomains === undefined || detailDomains.includes("audio")) && <StableAudioFilters search={search} onFlyoutOpen={onFlyoutOpen} onSearchOptionsChange={onSearchOptionsChange} />}
</>;

export default StableMediaFilters;
