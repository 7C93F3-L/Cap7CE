import { useState, type MouseEvent } from "react";
import {
  normalizeSearchCountRange,
  searchDataColumnCountPresets,
  searchDataRecordCountPresets,
  searchJsonRootKinds,
  searchTextCharacterCountPresets,
  searchTextLineCountPresets,
  type SearchCountRange
} from "../../../electron/textDataSearchFilters";
import { t, type TranslationKey } from "../../../electron/localization";
import type { SearchState } from "../../shared/types";
import { isCsvOnlyExtensionSelection, isJsonOnlyExtensionSelection, isTextOnlyExtensionSelection } from "./exploreFormatFilters";
import StableFilterEditGlyph from "./StableFilterEditGlyph";
import StableSidebarFlyout from "./StableSidebarFlyout";
import "./StableTextDataFilters.css";

const characterLabels: Record<(typeof searchTextCharacterCountPresets)[number], TranslationKey> = {
  "up-to-100": "explore.count.upTo100",
  "101-1000": "explore.count.101To1000",
  "1001-10000": "explore.count.1001To10000",
  "10001-100000": "explore.count.10001To100000",
  "over-100000": "explore.count.over100000"
};
const lineLabels: Record<(typeof searchTextLineCountPresets)[number], TranslationKey> = {
  "up-to-10": "explore.count.upTo10",
  "11-50": "explore.count.11To50",
  "51-200": "explore.count.51To200",
  "201-1000": "explore.count.201To1000",
  "over-1000": "explore.count.over1000"
};
const recordLabels: Record<(typeof searchDataRecordCountPresets)[number], TranslationKey> = {
  "up-to-10": "explore.count.upTo10",
  "11-100": "explore.count.11To100",
  "101-1000": "explore.count.101To1000",
  "1001-10000": "explore.count.1001To10000",
  "over-10000": "explore.count.over10000"
};
const columnLabels: Record<(typeof searchDataColumnCountPresets)[number], TranslationKey> = {
  one: "explore.count.one",
  "2-5": "explore.count.twoToFive",
  "6-10": "explore.count.sixToTen",
  "11-30": "explore.count.elevenToThirty",
  "over-30": "explore.count.overThirty"
};
const rootLabels: Record<(typeof searchJsonRootKinds)[number], TranslationKey> = {
  array: "explore.jsonRootKind.array",
  object: "explore.jsonRootKind.object"
};
const toNumber = (value: string) => value ? Number(value) : undefined;

interface CountSection {
  key: string;
  title: TranslationKey;
  presets: readonly string[];
  labels: Record<string, TranslationKey>;
  selectedPreset?: string;
  range?: SearchCountRange;
  onPreset: (preset?: string) => void;
  onRange: (range?: SearchCountRange) => void;
}

const StableTextDataFilters = ({ search, onFlyoutOpen, onSearchOptionsChange }: { search: SearchState; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void }) => {
  const extensions = search.selectedExtensions ?? [];
  const textMode = isTextOnlyExtensionSelection(extensions);
  const csvMode = isCsvOnlyExtensionSelection(extensions);
  const jsonMode = isJsonOnlyExtensionSelection(extensions);
  const [flyout, setFlyout] = useState<{ key: string; anchor: DOMRect } | null>(null);
  const [minimumCount, setMinimumCount] = useState("");
  const [maximumCount, setMaximumCount] = useState("");
  if (!textMode && !csvMode && !jsonMode) return null;

  const countSections: CountSection[] = textMode ? [
    {
      key: "characters", title: "explore.textCharacterCount", presets: searchTextCharacterCountPresets, labels: characterLabels,
      selectedPreset: search.textCharacterCountPreset, range: search.textCharacterCountRange,
      onPreset: (preset) => onSearchOptionsChange({ ...search, textCharacterCountPreset: preset as SearchState["textCharacterCountPreset"], textCharacterCountRange: undefined }),
      onRange: (range) => onSearchOptionsChange({ ...search, textCharacterCountPreset: undefined, textCharacterCountRange: range })
    },
    {
      key: "lines", title: "explore.textLineCount", presets: searchTextLineCountPresets, labels: lineLabels,
      selectedPreset: search.textLineCountPreset, range: search.textLineCountRange,
      onPreset: (preset) => onSearchOptionsChange({ ...search, textLineCountPreset: preset as SearchState["textLineCountPreset"], textLineCountRange: undefined }),
      onRange: (range) => onSearchOptionsChange({ ...search, textLineCountPreset: undefined, textLineCountRange: range })
    }
  ] : csvMode ? [
    {
      key: "csv-records", title: "explore.csvRecordCount", presets: searchDataRecordCountPresets, labels: recordLabels,
      selectedPreset: search.csvRecordCountPreset, range: search.csvRecordCountRange,
      onPreset: (preset) => onSearchOptionsChange({ ...search, csvRecordCountPreset: preset as SearchState["csvRecordCountPreset"], csvRecordCountRange: undefined }),
      onRange: (range) => onSearchOptionsChange({ ...search, csvRecordCountPreset: undefined, csvRecordCountRange: range })
    },
    {
      key: "csv-columns", title: "explore.csvColumnCount", presets: searchDataColumnCountPresets, labels: columnLabels,
      selectedPreset: search.csvColumnCountPreset, range: search.csvColumnCountRange,
      onPreset: (preset) => onSearchOptionsChange({ ...search, csvColumnCountPreset: preset as SearchState["csvColumnCountPreset"], csvColumnCountRange: undefined }),
      onRange: (range) => onSearchOptionsChange({ ...search, csvColumnCountPreset: undefined, csvColumnCountRange: range })
    }
  ] : [
    {
      key: "json-items", title: "explore.jsonItemCount", presets: searchDataRecordCountPresets, labels: recordLabels,
      selectedPreset: search.jsonItemCountPreset, range: search.jsonItemCountRange,
      onPreset: (preset) => onSearchOptionsChange({ ...search, jsonItemCountPreset: preset as SearchState["jsonItemCountPreset"], jsonItemCountRange: undefined }),
      onRange: (range) => onSearchOptionsChange({ ...search, jsonItemCountPreset: undefined, jsonItemCountRange: range })
    }
  ];
  const openRange = (section: CountSection, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onFlyoutOpen();
    setMinimumCount(String(section.range?.minCount ?? ""));
    setMaximumCount(String(section.range?.maxCount ?? ""));
    setFlyout(flyout?.key === section.key ? null : { key: section.key, anchor: event.currentTarget.getBoundingClientRect() });
  };
  const normalizedRange = normalizeSearchCountRange({ minCount: toNumber(minimumCount), maxCount: toNumber(maximumCount) });

  return <>
    {countSections.map((section) => <section className="cap-stable-text-data-count-filter" key={section.key}>
      <header><strong>{t(section.title)}</strong><button type="button" title={t("explore.editCountRange")} aria-label={t("explore.editCountRange")} aria-expanded={flyout?.key === section.key} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => openRange(section, event)}><StableFilterEditGlyph /></button></header>
      <div className="cap-stable-text-data-count-options">{section.presets.map((preset) => <button type="button" className={section.selectedPreset === preset ? "is-selected" : ""} aria-pressed={section.selectedPreset === preset} key={preset} onClick={() => section.onPreset(section.selectedPreset === preset ? undefined : preset)}>{t(section.labels[preset])}</button>)}</div>
      {flyout?.key === section.key && <StableSidebarFlyout anchor={flyout.anchor} label={t("explore.editCountRange")} placement="below" align="start" width={320} maximumHeight={220} className="cap-stable-explore-flyout cap-stable-text-data-count-flyout" onClose={() => setFlyout(null)}>
        <div className="cap-stable-text-data-count-fields"><label>{t("explore.minimumCount")}<input type="number" min="0" max="1000000000" step="1" value={minimumCount} onChange={(event) => setMinimumCount(event.target.value)} /></label><label>{t("explore.maximumCount")}<input type="number" min="0" max="1000000000" step="1" value={maximumCount} onChange={(event) => setMaximumCount(event.target.value)} /></label></div>
        <div className="cap-stable-flyout-actions"><button type="button" onClick={() => { section.onRange(undefined); setFlyout(null); }}>{t("explore.clearFilters")}</button><button type="button" className="is-selected" disabled={!normalizedRange} onClick={() => { if (!normalizedRange) return; section.onRange(normalizedRange); setFlyout(null); }}>{t("common.confirm")}</button></div>
      </StableSidebarFlyout>}
    </section>)}
    {jsonMode && <section className="cap-stable-json-root-filter">
      <header><strong>{t("explore.jsonRootKind")}</strong></header>
      <div className="cap-stable-json-root-options">{searchJsonRootKinds.map((kind) => <button type="button" className={search.jsonRootKind === kind ? "is-selected" : ""} aria-pressed={search.jsonRootKind === kind} key={kind} onClick={() => onSearchOptionsChange({ ...search, jsonRootKind: search.jsonRootKind === kind ? undefined : kind })}>{t(rootLabels[kind])}</button>)}</div>
    </section>}
  </>;
};

export default StableTextDataFilters;
