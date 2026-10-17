import type { CSSProperties } from "react";
import { searchImageColorTraits, searchVisualColors } from "../../../electron/imageSearchFilters";
import { t } from "../../../electron/localization";
import type { SearchState } from "../../shared/types";
import { colorLabels, colorTraitLabels, toggleValue } from "./imageFilterOptions";

const StableImageColorFilter = ({ search, onSearchOptionsChange }: { search: SearchState; onSearchOptionsChange: (search: SearchState) => void }) => {
  const traits = search.imageColorTraits ?? [];
  const colors = search.visualColors ?? [];
  return <section className="cap-stable-image-color-filter">
    <header><strong>{t("explore.imageColors")}</strong></header>
    <div className="cap-stable-color-options">{searchVisualColors.map((color) => <button type="button" className={colors.includes(color) ? `is-selected is-${color}` : `is-${color}`} style={{ "--cap-color-swatch": `var(--cap-image-color-${color}, transparent)` } as CSSProperties} title={t(colorLabels[color])} aria-label={t(colorLabels[color])} aria-pressed={colors.includes(color)} key={color} onClick={() => { const visualColors = toggleValue(colors, color); onSearchOptionsChange({ ...search, visualColors: visualColors.length ? visualColors : undefined }); }} />)}
      {searchImageColorTraits.map((trait) => <button type="button" className={`${traits.includes(trait) ? "is-selected " : ""}is-${trait}`} title={t(colorTraitLabels[trait])} aria-label={t(colorTraitLabels[trait])} aria-pressed={traits.includes(trait)} key={trait} onClick={() => { const next = toggleValue(traits, trait); onSearchOptionsChange({ ...search, imageColorTraits: next.length ? next : undefined }); }} />)}
    </div>
  </section>;
};
export default StableImageColorFilter;
