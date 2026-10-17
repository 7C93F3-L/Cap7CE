import { useEffect, useLayoutEffect, useMemo, useState, type MouseEvent } from "react";
import { t, type TranslationKey } from "../../../electron/localization";
import type { SearchState } from "../../shared/types";
import type { SearchFilterDetailDomain } from "../../shared/searchFilterTypes";
import StableSidebarFlyout from "./StableSidebarFlyout";
import { getOtherFileTypeExtensions, getPrimaryFileTypeExtensions, type ExploreOtherFileType, type ExplorePrimaryFileType } from "./exploreFormatFilters";
import { getExploreFormatSummary } from "./exploreFormatSummary";
import StableFilterEditGlyph from "./StableFilterEditGlyph";
import StableMediaFilters from "./StableMediaFilters";
import StableFileSizeFilter from "./StableFileSizeFilter";
import StableDocumentFilters from "./StableDocumentFilters";
import StableTextDataFilters from "./StableTextDataFilters";
import StableArtboardFilter from "./StableArtboardFilter";
import StableThreeDFilters from "./StableThreeDFilters";
import StableArchiveFilters from "./StableArchiveFilters";
import StableFontFilters from "./StableFontFilters";
import StableModelFilters from "./StableModelFilters";
import { retainApplicableExploreTypeFilters } from "./exploreTypeFilterState";
import "./StableExploreFilters.css";
type FilterFlyoutKind = "dates";
type FilterFlyout = { kind: FilterFlyoutKind; anchor: DOMRect } | null;
const timePresets = ["week", "month", "year", "last-year", "older", "all"] as const;
const timeAdjustmentKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
const fileTypes: Array<ExplorePrimaryFileType | ExploreOtherFileType> = ["image", "video", "audio", "document", "text", "project", "threeD", "archive", "data", "font", "model"];
const timeLabels: Record<(typeof timePresets)[number], TranslationKey> = {
  week: "explore.time.week", month: "explore.time.month", year: "explore.time.year",
  "last-year": "explore.time.lastYear", older: "explore.time.older", all: "explore.time.all"
};
const primaryLabels: Record<ExplorePrimaryFileType, TranslationKey> = {
  image: "explore.fileTypes.image", video: "explore.fileTypes.video", audio: "explore.fileTypes.audio", document: "explore.fileTypes.document"
};
const otherLabels: Record<ExploreOtherFileType, TranslationKey> = {
  text: "explore.fileTypes.text", project: "explore.fileTypes.project", threeD: "explore.fileTypes.threeD",
  archive: "explore.fileTypes.archive", data: "explore.fileTypes.data", font: "explore.fileTypes.font", model: "explore.fileTypes.model"
};
const typeLabels = { ...primaryLabels, ...otherLabels };
const pad = (value: number) => String(value).padStart(2, "0");
const toDateInput = (timestamp: number) => { const date = new Date(timestamp); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; };
const parseDateInput = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day).getTime(); };
const getDefaultDates = () => { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 30); return [toDateInput(start.getTime()), toDateInput(end.getTime())] as const; };
const toggleExtensions = (current: readonly string[], group: readonly string[]) => {
  const next = new Set(current);
  const remove = group.length > 0 && group.every((extension) => next.has(extension));
  group.forEach((extension) => remove ? next.delete(extension) : next.add(extension));
  return [...next].sort();
};
const isGroupSelected = (selected: ReadonlySet<string>, group: readonly string[]) => group.length > 0 && group.every((extension) => selected.has(extension));
const StableExploreFilters = ({ search, availableFormats, detailDomains, compactTime = false, allowUnclassified = false, metadataDisabled = false, metadataColorsDisabled = false, closeFlyoutRequest, onFlyoutOpen, onSearchOptionsChange }: { search: SearchState; availableFormats: string[]; detailDomains?: readonly SearchFilterDetailDomain[]; compactTime?: boolean; allowUnclassified?: boolean; metadataDisabled?: boolean; metadataColorsDisabled?: boolean; closeFlyoutRequest: number; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void }) => {
  const supports = (domain: SearchFilterDetailDomain) => detailDomains === undefined || detailDomains.includes(domain);
  const [flyout, setFlyout] = useState<FilterFlyout>(null);
  const selected = useMemo(() => new Set(search.selectedExtensions ?? []), [search.selectedExtensions]);
  const presetIndex = Math.max(0, timePresets.indexOf(search.timePreset === "custom" ? "all" : (search.timePreset ?? "all")));
  const [timeIndex, setTimeIndex] = useState(presetIndex);
  const defaultDates = getDefaultDates();
  const [startDate, setStartDate] = useState(defaultDates[0]);
  const [endDate, setEndDate] = useState(defaultDates[1]);
  const summaryItems = getExploreFormatSummary(availableFormats, search.selectedExtensions ?? []);
  const selectedSummary = search.unclassifiedOnly ? t("explore.fileTypes.other") : `${summaryItems.slice(0, 2).map((item) => item.kind === "type" ? t(typeLabels[item.value]) : item.value.toUpperCase()).join("  ")}${summaryItems.length > 2 ? `  +${summaryItems.length - 2}` : ""}`;
  useEffect(() => setTimeIndex(presetIndex), [presetIndex]);
  useLayoutEffect(() => setFlyout(null), [closeFlyoutRequest]);
  const applySearch = (next: SearchState) => onSearchOptionsChange(next);
  const openFlyout = (kind: FilterFlyoutKind, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (kind === "dates" && search.modifiedTimeRange) {
      setStartDate(toDateInput(search.modifiedTimeRange.startMs));
      setEndDate(toDateInput(search.modifiedTimeRange.endMs - 1));
    }
    const anchor = event.currentTarget.getBoundingClientRect();
    const nextFlyout = flyout?.kind === kind ? null : { kind, anchor };
    if (nextFlyout) onFlyoutOpen();
    setFlyout(nextFlyout);
  };
  const commitTime = (index = timeIndex) => {
    const timePreset = timePresets[index];
    if (search.timePreset === timePreset && !search.modifiedTimeRange) return;
    applySearch({ ...search, timePreset, modifiedTimeRange: undefined });
  };
  const applyDateRange = () => {
    const startMs = parseDateInput(startDate);
    const endMs = parseDateInput(endDate);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return;
    const exclusiveEnd = new Date(endMs); exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
    applySearch({ ...search, timePreset: "custom", modifiedTimeRange: { startMs, endMs: exclusiveEnd.getTime() } });
    setFlyout(null);
  };
  const toggleGroup = (extensions: readonly string[]) => {
    const nextExtensions = toggleExtensions(search.selectedExtensions ?? [], extensions);
    const nextSearch = { ...search, unclassifiedOnly: undefined, selectedExtensions: nextExtensions.length ? nextExtensions : undefined };
    applySearch(retainApplicableExploreTypeFilters(nextSearch, nextExtensions));
  };
  const customRangeLabel = search.timePreset === "custom" && search.modifiedTimeRange
    ? t("explore.time.range", { start: toDateInput(search.modifiedTimeRange.startMs).replace(/-/g, "."), end: toDateInput(search.modifiedTimeRange.endMs - 1).replace(/-/g, ".") }) : "";
  return <div className="cap-stable-explore-filters">
    <section className="cap-stable-time-filter">
      <header><strong>{t("explore.time")}</strong><button type="button" title={t("explore.editTime")} aria-label={t("explore.editTime")} aria-expanded={flyout?.kind === "dates"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => openFlyout("dates", event)}><StableFilterEditGlyph /></button>{customRangeLabel && <span title={customRangeLabel}>{compactTime ? t("explore.time.customShort") : customRangeLabel}</span>}</header>
      <div className="cap-stable-time-control"><div className="cap-stable-time-rails" aria-hidden="true"><i /><i /><i /></div><input className={search.timePreset === "custom" ? "is-custom" : ""} type="range" min="0" max={timePresets.length - 1} step="1" value={timeIndex} aria-label={t("explore.time")} onChange={(event) => setTimeIndex(Number(event.target.value))} onPointerUp={(event) => commitTime(Number(event.currentTarget.value))} onPointerCancel={(event) => commitTime(Number(event.currentTarget.value))} onKeyUp={(event) => { if (timeAdjustmentKeys.has(event.key)) commitTime(Number(event.currentTarget.value)); }} /></div>
      <div className="cap-stable-time-labels">{timePresets.map((preset, index) => <button type="button" className={search.timePreset !== "custom" && presetIndex === index ? "is-selected" : ""} aria-pressed={search.timePreset !== "custom" && presetIndex === index} key={preset} onClick={() => { setTimeIndex(index); commitTime(index); }}><i aria-hidden="true" />{t(timeLabels[preset])}</button>)}</div>
    </section>
    <section className="cap-stable-file-type-filter">
      <header><strong>{t("explore.fileTypes")}</strong>{selectedSummary && <span title={selectedSummary}>{selectedSummary}</span>}</header>
      <div className="cap-stable-file-type-options">
        {fileTypes.map((type) => {
          const extensions = type === "image" || type === "video" || type === "audio" || type === "document"
            ? getPrimaryFileTypeExtensions(availableFormats, type) : getOtherFileTypeExtensions(availableFormats, type);
          const pressed = isGroupSelected(selected, extensions);
          return <button type="button" className={pressed ? "is-selected" : ""} disabled={extensions.length === 0} aria-pressed={pressed} key={type} onClick={() => toggleGroup(extensions)}>{t(typeLabels[type])}</button>;
        })}
        {allowUnclassified && <button type="button" className={search.unclassifiedOnly ? "is-selected" : ""} aria-pressed={Boolean(search.unclassifiedOnly)} onClick={() => applySearch(retainApplicableExploreTypeFilters({ ...search, fileFormat: "all", selectedExtensions: undefined, unclassifiedOnly: search.unclassifiedOnly ? undefined : true }, []))}>{t("explore.fileTypes.other")}</button>}
      </div>
    </section>
    <StableFileSizeFilter search={search} onFlyoutOpen={() => setFlyout(null)} onSearchOptionsChange={onSearchOptionsChange} />
    <fieldset className="cap-stable-metadata-filters" disabled={metadataDisabled}>
    {supports("project") && <StableArtboardFilter search={search} onFlyoutOpen={() => setFlyout(null)} onSearchOptionsChange={onSearchOptionsChange} />}
    <StableMediaFilters metadataColorsDisabled={metadataColorsDisabled} search={search} detailDomains={detailDomains} onFlyoutOpen={() => setFlyout(null)} onSearchOptionsChange={onSearchOptionsChange} />
    {supports("document") && <StableDocumentFilters search={search} onFlyoutOpen={() => setFlyout(null)} onSearchOptionsChange={onSearchOptionsChange} />}
    {(supports("text") || supports("data")) && <StableTextDataFilters search={search} onFlyoutOpen={() => setFlyout(null)} onSearchOptionsChange={onSearchOptionsChange} />}
    {supports("threeD") && <StableThreeDFilters search={search} onFlyoutOpen={() => setFlyout(null)} onSearchOptionsChange={onSearchOptionsChange} />}
    {supports("archive") && <StableArchiveFilters search={search} onFlyoutOpen={() => setFlyout(null)} onSearchOptionsChange={onSearchOptionsChange} />}
    {supports("font") && <StableFontFilters search={search} onSearchOptionsChange={onSearchOptionsChange} />}
    {supports("model") && <StableModelFilters search={search} onSearchOptionsChange={onSearchOptionsChange} />}
    </fieldset>
    {flyout?.kind === "dates" && <StableSidebarFlyout anchor={flyout.anchor} label={t("explore.editTime")} placement="below" align="start" width={360} maximumHeight={220} className="cap-stable-explore-flyout" onClose={() => setFlyout(null)}>
      <div className="cap-stable-date-fields"><label>{t("explore.startDate")}<input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>{t("explore.endDate")}<input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} /></label></div>
      <div className="cap-stable-flyout-actions"><button type="button" onClick={() => setFlyout(null)}>{t("common.cancel")}</button><button type="button" className="is-selected" onClick={applyDateRange}>{t("common.confirm")}</button></div>
    </StableSidebarFlyout>}
  </div>;
};
export default StableExploreFilters;
