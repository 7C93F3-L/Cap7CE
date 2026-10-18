import StableMetadataFilterGate from "./StableMetadataFilterGate";
import type { SearchState } from "../../shared/types";
import { isImageOnlyExtensionSelection } from "./exploreFormatFilters";
import StableImageColorFilter from "./StableImageColorFilter";
import StableImageAnimationFilter from "./StableImageAnimationFilter";
import StableImageDimensionFilter from "./StableImageDimensionFilter";
import StableImageRatioFilter from "./StableImageRatioFilter";
import "./StableImageFilters.css";
import "./StableImageFilterFlyouts.css";

interface StableImageFiltersProps { colorsDisabled?: boolean; search: SearchState; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void; }

const StableImageFilters = ({ search, colorsDisabled = false, onFlyoutOpen, onSearchOptionsChange }: StableImageFiltersProps) => {
  if (!isImageOnlyExtensionSelection(search.selectedExtensions ?? [])) return null;
  const props = { search, onFlyoutOpen, onSearchOptionsChange };
  return <>
    <StableMetadataFilterGate className="cap-stable-metadata-colors" unavailable={colorsDisabled}><StableImageColorFilter search={search} onSearchOptionsChange={onSearchOptionsChange} /></StableMetadataFilterGate>
    <StableImageRatioFilter {...props} />
    <StableImageDimensionFilter {...props} />
    <StableImageAnimationFilter search={search} onSearchOptionsChange={onSearchOptionsChange} />
  </>;
};

export default StableImageFilters;
