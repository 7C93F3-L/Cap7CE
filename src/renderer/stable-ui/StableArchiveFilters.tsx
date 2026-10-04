import { useState, type MouseEvent } from "react";
import {
  normalizeArchiveEntryCountRange,
  searchArchiveContentTypes,
  searchArchiveEntryCountPresets,
  searchArchiveStructures,
  type SearchArchiveContentType,
  type SearchArchiveStructure
} from "../../../electron/archiveSearchFilters";
import { supportedArchiveFactExtensions } from "../../../electron/archiveFactTypes";
import { t, type TranslationKey } from "../../../electron/localization";
import type { SearchState } from "../../shared/types";
import { isArchiveOnlyExtensionSelection } from "./exploreFormatFilters";
import { toggleValue } from "./imageFilterOptions";
import StableFilterEditGlyph from "./StableFilterEditGlyph";
import StableSidebarFlyout from "./StableSidebarFlyout";
import "./StableArchiveFilters.css";

const contentLabels: Record<SearchArchiveContentType, TranslationKey> = {
  image: "explore.archiveContent.image",
  video: "explore.archiveContent.video",
  audio: "explore.archiveContent.audio",
  document: "explore.archiveContent.document",
  project: "explore.archiveContent.project",
  threeD: "explore.archiveContent.threeD",
  program: "explore.archiveContent.program",
  other: "explore.archiveContent.other"
};
const structureLabels: Record<SearchArchiveStructure, TranslationKey> = {
  flat: "explore.archiveStructure.flat",
  nested: "explore.archiveStructure.nested"
};
const countLabels: Record<(typeof searchArchiveEntryCountPresets)[number], TranslationKey> = {
  "under-10": "explore.archiveEntryCount.underTen",
  "10-100": "explore.archiveEntryCount.tenToHundred",
  "100-1000": "explore.archiveEntryCount.hundredToThousand",
  "over-1000": "explore.archiveEntryCount.overThousand"
};
const toNumber = (value: string) => value ? Number(value) : undefined;

const StableArchiveFilters = ({ search, onFlyoutOpen, onSearchOptionsChange }: { search: SearchState; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void }) => {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [minimumCount, setMinimumCount] = useState("");
  const [maximumCount, setMaximumCount] = useState("");
  const selectedExtensions = search.selectedExtensions ?? [];
  if (!isArchiveOnlyExtensionSelection(selectedExtensions)
    || !selectedExtensions.some((extension) => supportedArchiveFactExtensions.includes(extension as (typeof supportedArchiveFactExtensions)[number]))) return null;
  const selectedContent = search.archiveContentTypes ?? [];
  const selectedStructures = search.archiveStructures ?? [];
  const openCountRange = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onFlyoutOpen();
    setMinimumCount(String(search.archiveEntryCountRange?.minCount ?? ""));
    setMaximumCount(String(search.archiveEntryCountRange?.maxCount ?? ""));
    setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect());
  };
  const countRange = normalizeArchiveEntryCountRange({ minCount: toNumber(minimumCount), maxCount: toNumber(maximumCount) });
  return <>
    <section className="cap-stable-archive-content-filter">
      <header><strong>{t("explore.archiveContent")}</strong></header>
      <div className="cap-stable-archive-content-options">{searchArchiveContentTypes.map((value) => <button type="button" className={selectedContent.includes(value) ? "is-selected" : ""} aria-pressed={selectedContent.includes(value)} key={value} onClick={() => { const next = toggleValue(selectedContent, value); onSearchOptionsChange({ ...search, archiveContentTypes: next.length ? next : undefined }); }}><i className={`is-${value}`} aria-hidden="true" /><span>{t(contentLabels[value])}</span></button>)}</div>
    </section>
    <section className="cap-stable-archive-count-filter">
      <header><strong>{t("explore.archiveEntryCount")}</strong><button type="button" title={t("explore.editArchiveEntryCount")} aria-label={t("explore.editArchiveEntryCount")} aria-expanded={Boolean(anchor)} onPointerDown={(event) => event.stopPropagation()} onClick={openCountRange}><StableFilterEditGlyph /></button></header>
      <div className="cap-stable-archive-count-options">{searchArchiveEntryCountPresets.map((preset) => <button type="button" className={search.archiveEntryCountPreset === preset ? "is-selected" : ""} aria-pressed={search.archiveEntryCountPreset === preset} key={preset} onClick={() => onSearchOptionsChange({ ...search, archiveEntryCountPreset: search.archiveEntryCountPreset === preset ? undefined : preset, archiveEntryCountRange: undefined })}>{t(countLabels[preset])}</button>)}</div>
      {anchor && <StableSidebarFlyout anchor={anchor} label={t("explore.editArchiveEntryCount")} placement="below" align="start" width={360} maximumHeight={220} className="cap-stable-explore-flyout cap-stable-archive-count-flyout" onClose={() => setAnchor(null)}>
        <div className="cap-stable-archive-count-fields"><label>{t("explore.minimumCount")}<input type="number" min="0" max="2000000000" step="1" value={minimumCount} onChange={(event) => setMinimumCount(event.target.value)} /></label><label>{t("explore.maximumCount")}<input type="number" min="0" max="2000000000" step="1" value={maximumCount} onChange={(event) => setMaximumCount(event.target.value)} /></label></div>
        <div className="cap-stable-flyout-actions"><button type="button" onClick={() => { onSearchOptionsChange({ ...search, archiveEntryCountPreset: undefined, archiveEntryCountRange: undefined }); setAnchor(null); }}>{t("explore.clearFilters")}</button><button type="button" className="is-selected" disabled={!countRange} onClick={() => { if (!countRange) return; onSearchOptionsChange({ ...search, archiveEntryCountPreset: undefined, archiveEntryCountRange: countRange }); setAnchor(null); }}>{t("common.confirm")}</button></div>
      </StableSidebarFlyout>}
    </section>
    <section className="cap-stable-archive-structure-filter">
      <header><strong>{t("explore.archiveStructure")}</strong></header>
      <div className="cap-stable-archive-structure-options">{searchArchiveStructures.map((value) => <button type="button" className={selectedStructures.includes(value) ? "is-selected" : ""} aria-pressed={selectedStructures.includes(value)} key={value} onClick={() => { const next = toggleValue(selectedStructures, value); onSearchOptionsChange({ ...search, archiveStructures: next.length ? next : undefined }); }}><i className={`is-${value}`} aria-hidden="true" /><span>{t(structureLabels[value])}</span></button>)}</div>
    </section>
  </>;
};

export default StableArchiveFilters;
