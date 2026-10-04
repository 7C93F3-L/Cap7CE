import { searchImageAnimationModes } from "../../../electron/imageSearchFilters";
import { t } from "../../../electron/localization";
import type { SearchState } from "../../shared/types";
import "./StableImageAnimationFilter.css";

const StableImageAnimationFilter = ({ search, onSearchOptionsChange }: { search: SearchState; onSearchOptionsChange: (search: SearchState) => void }) => <section className="cap-stable-image-animation-filter">
  <header><strong>{t("explore.imageAnimation")}</strong></header>
  <div>{searchImageAnimationModes.map((mode) => <button type="button" className={search.imageAnimation === mode ? "is-selected" : ""} aria-pressed={search.imageAnimation === mode} key={mode} onClick={() => onSearchOptionsChange({ ...search, imageAnimation: search.imageAnimation === mode ? undefined : mode })}><i className={`is-${mode}`} aria-hidden="true" /><span>{t(mode === "animated" ? "explore.animation.animated" : "explore.animation.static")}</span></button>)}</div>
</section>;

export default StableImageAnimationFilter;
