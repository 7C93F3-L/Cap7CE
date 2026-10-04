import { t, type TranslationKey } from "../../../electron/localization";
import { searchImageAspectRatios, searchVisualColors, type SearchImageAspectRatio, type SearchVisualColor } from "../../../electron/searchFilters";
import type { CSSProperties } from "react";
import type { SearchState } from "../../shared/types";
import { isImageOnlyExtensionSelection } from "./exploreFormatFilters";
import "./StableImageFilters.css";

const colorLabels: Record<SearchVisualColor, TranslationKey> = {
  red: "explore.color.red", orange: "explore.color.orange", yellow: "explore.color.yellow", green: "explore.color.green",
  cyan: "explore.color.cyan", blue: "explore.color.blue", purple: "explore.color.purple", pink: "explore.color.pink",
  "black-background": "explore.color.black", "gray-tone": "explore.color.gray", "white-background": "explore.color.white",
  "transparent-background": "explore.color.transparent"
};
const ratioLabels: Record<SearchImageAspectRatio, TranslationKey> = {
  portrait: "explore.ratio.portrait", landscape: "explore.ratio.landscape", square: "explore.ratio.square",
  wide: "explore.ratio.wide", tall: "explore.ratio.tall"
};

const toggleValue = <T extends string>(current: readonly T[], value: T) => current.includes(value)
  ? current.filter((item) => item !== value)
  : [...current, value];

const StableImageFilters = ({ search, onSearchOptionsChange }: { search: SearchState; onSearchOptionsChange: (search: SearchState) => void }) => {
  if (!isImageOnlyExtensionSelection(search.selectedExtensions ?? [])) return null;
  const selectedColors = search.visualColors ?? [];
  const selectedRatios = search.imageAspectRatios ?? [];
  return <>
    <section className="cap-stable-image-color-filter">
      <header><strong>{t("explore.imageColors")}</strong></header>
      <div className="cap-stable-color-options">{searchVisualColors.map((color) => <button type="button" className={selectedColors.includes(color) ? `is-selected is-${color}` : `is-${color}`} style={{ "--cap-color-swatch": `var(--cap-image-color-${color}, transparent)` } as CSSProperties} title={t(colorLabels[color])} aria-label={t(colorLabels[color])} aria-pressed={selectedColors.includes(color)} key={color} onClick={() => { const visualColors = toggleValue(selectedColors, color); onSearchOptionsChange({ ...search, visualColors: visualColors.length ? visualColors : undefined }); }} />)}</div>
    </section>
    <section className="cap-stable-image-ratio-filter">
      <header><strong>{t("explore.imageRatios")}</strong></header>
      <div className="cap-stable-ratio-options">{searchImageAspectRatios.map((ratio) => <button type="button" className={selectedRatios.includes(ratio) ? "is-selected" : ""} aria-pressed={selectedRatios.includes(ratio)} key={ratio} onClick={() => { const imageAspectRatios = toggleValue(selectedRatios, ratio); onSearchOptionsChange({ ...search, imageAspectRatios: imageAspectRatios.length ? imageAspectRatios : undefined }); }}><i className={`is-${ratio}`} aria-hidden="true" /><span>{t(ratioLabels[ratio])}</span></button>)}</div>
    </section>
  </>;
};

export default StableImageFilters;
