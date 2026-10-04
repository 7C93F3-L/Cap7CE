import { t, type TranslationKey } from "../../../electron/localization";
import {
  searchFontCharacterSets, searchFontKinds, searchFontStyles, searchFontWeights,
  type SearchFontCharacterSet, type SearchFontKind, type SearchFontStyle, type SearchFontWeight
} from "../../../electron/fontSearchFilters";
import { supportedFontFactExtensions } from "../../../electron/fontFactTypes";
import type { SearchState } from "../../shared/types";
import { isFontOnlyExtensionSelection } from "./exploreFormatFilters";
import { toggleValue } from "./imageFilterOptions";
import "./StableFontFilters.css";

const weightLabels: Record<SearchFontWeight, TranslationKey> = {
  thin: "explore.fontWeight.thin", regular: "explore.fontWeight.regular", medium: "explore.fontWeight.medium",
  bold: "explore.fontWeight.bold", black: "explore.fontWeight.black"
};
const styleLabels: Record<SearchFontStyle, TranslationKey> = { normal: "explore.fontStyle.normal", italic: "explore.fontStyle.italic" };
const characterLabels: Record<SearchFontCharacterSet, TranslationKey> = { latin: "explore.fontCharacters.latin", chinese: "explore.fontCharacters.chinese" };
const kindLabels: Record<SearchFontKind, TranslationKey> = { static: "explore.fontKind.static", variable: "explore.fontKind.variable" };

const FontOptionSection = <T extends string>({ className, title, values, selected, labels, onToggle }: {
  className: string; title: TranslationKey; values: readonly T[]; selected: readonly T[];
  labels: Record<T, TranslationKey>; onToggle: (value: T) => void;
}) => <section className={`cap-stable-font-filter ${className}`}>
  <header><strong>{t(title)}</strong></header>
  <div>{values.map((value) => <button type="button" className={`${selected.includes(value) ? "is-selected" : ""} is-${value}`} aria-pressed={selected.includes(value)} key={value} onClick={() => onToggle(value)}>{t(labels[value])}</button>)}</div>
</section>;

const StableFontFilters = ({ search, onSearchOptionsChange }: { search: SearchState; onSearchOptionsChange: (search: SearchState) => void }) => {
  const extensions = search.selectedExtensions ?? [];
  if (!isFontOnlyExtensionSelection(extensions)
    || !extensions.some((extension) => supportedFontFactExtensions.includes(extension as (typeof supportedFontFactExtensions)[number]))) return null;
  const toggle = <T extends string>(values: T[] | undefined, value: T, key: "fontWeights" | "fontStyles" | "fontCharacterSets" | "fontKinds") => {
    const next = toggleValue(values ?? [], value);
    onSearchOptionsChange({ ...search, [key]: next.length ? next : undefined });
  };
  return <>
    <FontOptionSection className="is-fontWeights" title="explore.fontWeight" values={searchFontWeights} selected={search.fontWeights ?? []} labels={weightLabels} onToggle={(value) => toggle(search.fontWeights, value, "fontWeights")} />
    <FontOptionSection className="is-fontStyles" title="explore.fontStyle" values={searchFontStyles} selected={search.fontStyles ?? []} labels={styleLabels} onToggle={(value) => toggle(search.fontStyles, value, "fontStyles")} />
    <FontOptionSection className="is-fontCharacterSets" title="explore.fontCharacters" values={searchFontCharacterSets} selected={search.fontCharacterSets ?? []} labels={characterLabels} onToggle={(value) => toggle(search.fontCharacterSets, value, "fontCharacterSets")} />
    <FontOptionSection className="is-fontKinds" title="explore.fontKind" values={searchFontKinds} selected={search.fontKinds ?? []} labels={kindLabels} onToggle={(value) => toggle(search.fontKinds, value, "fontKinds")} />
  </>;
};
export default StableFontFilters;
