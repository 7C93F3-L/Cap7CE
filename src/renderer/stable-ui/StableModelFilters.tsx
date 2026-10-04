import { t, type TranslationKey } from "../../../electron/localization";
import {
  searchModelParameterCounts,
  searchModelPrecisions,
  type SearchModelParameterCount,
  type SearchModelPrecision
} from "../../../electron/modelSearchFilters";
import type { SearchState } from "../../shared/types";
import { isModelOnlyExtensionSelection } from "./exploreFormatFilters";
import { toggleValue } from "./imageFilterOptions";
import "./StableModelFilters.css";

const parameterLabels: Record<SearchModelParameterCount, TranslationKey> = {
  "under-1b": "explore.modelParameters.under1b",
  "1b-3b": "explore.modelParameters.1b3b",
  "3b-7b": "explore.modelParameters.3b7b",
  "7b-14b": "explore.modelParameters.7b14b",
  "14b-or-more": "explore.modelParameters.14bOrMore"
};
const precisionLabels: Record<SearchModelPrecision, TranslationKey> = {
  f32: "explore.modelPrecision.f32",
  "f16-bf16": "explore.modelPrecision.f16Bf16",
  "8bit": "explore.modelPrecision.8bit",
  "6bit": "explore.modelPrecision.6bit",
  "5bit": "explore.modelPrecision.5bit",
  "4bit": "explore.modelPrecision.4bit",
  "3bit-or-less": "explore.modelPrecision.3bitOrLess"
};

const ModelOptionSection = <T extends string>({ title, values, selected, labels, onToggle }: {
  title: TranslationKey; values: readonly T[]; selected: readonly T[];
  labels: Record<T, TranslationKey>; onToggle: (value: T) => void;
}) => <section className="cap-stable-model-filter">
  <header><strong>{t(title)}</strong></header>
  <div>{values.map((value) => <button type="button" className={selected.includes(value) ? "is-selected" : ""} aria-pressed={selected.includes(value)} key={value} onClick={() => onToggle(value)}>{t(labels[value])}</button>)}</div>
</section>;

const StableModelFilters = ({ search, onSearchOptionsChange }: { search: SearchState; onSearchOptionsChange: (search: SearchState) => void }) => {
  if (!isModelOnlyExtensionSelection(search.selectedExtensions ?? [])) return null;
  const toggle = <T extends string>(values: T[] | undefined, value: T, key: "modelParameterCounts" | "modelPrecisions") => {
    const next = toggleValue(values ?? [], value);
    onSearchOptionsChange({ ...search, [key]: next.length ? next : undefined });
  };
  return <>
    <ModelOptionSection title="explore.modelParameters" values={searchModelParameterCounts} selected={search.modelParameterCounts ?? []} labels={parameterLabels} onToggle={(value) => toggle(search.modelParameterCounts, value, "modelParameterCounts")} />
    <ModelOptionSection title="explore.modelPrecision" values={searchModelPrecisions} selected={search.modelPrecisions ?? []} labels={precisionLabels} onToggle={(value) => toggle(search.modelPrecisions, value, "modelPrecisions")} />
  </>;
};
export default StableModelFilters;
