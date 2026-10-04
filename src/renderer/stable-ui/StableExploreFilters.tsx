import { useEffect, useLayoutEffect, useMemo, useState, type MouseEvent, type WheelEvent } from "react";
import { t, type TranslationKey } from "../../../electron/localization";
import type { FileFormatCategory } from "../../../electron/formatCapabilities";
import type { SearchState } from "../../shared/types";
import StableSidebarFlyout from "./StableSidebarFlyout";
import {
  canonicalizeSelectedFormats,
  getExtensionsForCanonicalFormat,
  getFormatSelectionGroups,
  getOtherFileTypeExtensions,
  getPrimaryFileTypeExtensions,
  isImageOnlyExtensionSelection,
  type ExploreOtherFileType,
  type ExplorePrimaryFileType
} from "./exploreFormatFilters";
import StableImageFilters from "./StableImageFilters";
import "./StableExploreFilters.css";

type FilterFlyoutKind = "dates" | "formats" | "other";
type FilterFlyout = { kind: FilterFlyoutKind; anchor: DOMRect } | null;
const timePresets = ["week", "month", "year", "last-year", "older", "all"] as const;
const primaryTypes: ExplorePrimaryFileType[] = ["image", "video", "audio", "document"];
const otherTypes: ExploreOtherFileType[] = ["text", "project", "threeD", "archive", "data", "font", "model"];
const categoryOrder: FileFormatCategory[] = ["visual", "video", "audio", "document", "text", "data", "project", "threeD", "archive", "font", "model"];
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
const categoryLabels: Record<FileFormatCategory, TranslationKey> = {
  visual: "explore.fileTypes.image", video: "explore.fileTypes.video", audio: "explore.fileTypes.audio",
  document: "explore.fileTypes.document", text: "explore.fileTypes.text", data: "explore.fileTypes.data",
  archive: "explore.fileTypes.archive", font: "explore.fileTypes.font", threeD: "explore.fileTypes.threeD",
  project: "explore.fileTypes.project", model: "explore.fileTypes.model"
};

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

const EditGlyph = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 16-1 4 4-1L19 8l-3-3L5 16Z" /><path d="m14.5 6.5 3 3" /></svg>;
const TypeGlyph = ({ type }: { type: ExplorePrimaryFileType | "other" }) => <span className={`cap-stable-type-glyph is-${type}`} aria-hidden="true"><i /><b /></span>;

const StableExploreFilters = ({ search, availableFormats, closeFlyoutRequest, onFlyoutOpen, onSearchOptionsChange }: { search: SearchState; availableFormats: string[]; closeFlyoutRequest: number; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void }) => {
  const [flyout, setFlyout] = useState<FilterFlyout>(null);
  const selected = useMemo(() => new Set(search.selectedExtensions ?? []), [search.selectedExtensions]);
  const presetIndex = Math.max(0, timePresets.indexOf(search.timePreset === "custom" ? "all" : (search.timePreset ?? "all")));
  const [timeIndex, setTimeIndex] = useState(presetIndex);
  const defaultDates = getDefaultDates();
  const [startDate, setStartDate] = useState(defaultDates[0]);
  const [endDate, setEndDate] = useState(defaultDates[1]);
  const [formatDraft, setFormatDraft] = useState<string[]>(search.selectedExtensions ?? []);
  const formatGroups = useMemo(() => getFormatSelectionGroups(availableFormats), [availableFormats]);
  const selectedSummary = canonicalizeSelectedFormats(search.selectedExtensions ?? []).slice(0, 3).map((format) => format.toUpperCase()).join("  ");
  useEffect(() => setTimeIndex(presetIndex), [presetIndex]);
  useLayoutEffect(() => setFlyout(null), [closeFlyoutRequest]);

  const applySearch = (next: SearchState) => onSearchOptionsChange(next);
  const openFlyout = (kind: FilterFlyoutKind, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (kind === "dates" && search.modifiedTimeRange) {
      setStartDate(toDateInput(search.modifiedTimeRange.startMs));
      setEndDate(toDateInput(search.modifiedTimeRange.endMs - 1));
    }
    if (kind === "formats") setFormatDraft(search.selectedExtensions ?? []);
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
    const preserveImageFilters = isImageOnlyExtensionSelection(nextExtensions);
    applySearch({ ...search, selectedExtensions: nextExtensions.length ? nextExtensions : undefined, visualColors: preserveImageFilters ? search.visualColors : undefined, imageAspectRatios: preserveImageFilters ? search.imageAspectRatios : undefined });
  };
  const updateFormatDraft = (format: string) => setFormatDraft((current) => toggleExtensions(current, getExtensionsForCanonicalFormat(format)));
  const customRangeLabel = search.timePreset === "custom" && search.modifiedTimeRange
    ? t("explore.time.range", { start: toDateInput(search.modifiedTimeRange.startMs).replace(/-/g, "."), end: toDateInput(search.modifiedTimeRange.endMs - 1).replace(/-/g, ".") }) : "";
  const scrollFiltersHorizontally = (event: WheelEvent<HTMLDivElement>) => {
    const rail = event.currentTarget;
    if (rail.scrollWidth <= rail.clientWidth || (event.target as HTMLElement).closest('input[type="range"]')) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;
    event.preventDefault();
    setFlyout(null);
    rail.scrollLeft += delta;
  };

  return <div className="cap-stable-explore-filters" onWheel={scrollFiltersHorizontally}>
    <section className="cap-stable-time-filter">
      <header><strong>{t("explore.time")}</strong><button type="button" title={t("explore.editTime")} aria-label={t("explore.editTime")} aria-expanded={flyout?.kind === "dates"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => openFlyout("dates", event)}><EditGlyph /></button>{customRangeLabel && <span>{customRangeLabel}</span>}</header>
      <div className="cap-stable-time-control"><div className="cap-stable-time-rails" aria-hidden="true"><i /><i /><i /></div><input className={search.timePreset === "custom" ? "is-custom" : ""} type="range" min="0" max={timePresets.length - 1} step="1" value={timeIndex} aria-label={t("explore.time")} onChange={(event) => setTimeIndex(Number(event.target.value))} onPointerUp={(event) => commitTime(Number(event.currentTarget.value))} onKeyUp={(event) => commitTime(Number(event.currentTarget.value))} onBlur={(event) => commitTime(Number(event.currentTarget.value))} /></div>
      <div className="cap-stable-time-labels">{timePresets.map((preset, index) => <button type="button" className={search.timePreset !== "custom" && presetIndex === index ? "is-selected" : ""} key={preset} onClick={() => { setTimeIndex(index); commitTime(index); }}><i aria-hidden="true" />{t(timeLabels[preset])}</button>)}</div>
    </section>
    <section className="cap-stable-file-type-filter">
      <header><strong>{t("explore.fileTypes")}</strong><button type="button" title={t("explore.editFormats")} aria-label={t("explore.editFormats")} aria-expanded={flyout?.kind === "formats"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => openFlyout("formats", event)}><EditGlyph /></button>{selectedSummary && <span>{selectedSummary}</span>}</header>
      <div className="cap-stable-file-type-options">
        {primaryTypes.map((type) => { const extensions = getPrimaryFileTypeExtensions(availableFormats, type); return <button type="button" className={isGroupSelected(selected, extensions) ? "is-selected" : ""} disabled={extensions.length === 0} aria-pressed={isGroupSelected(selected, extensions)} key={type} onClick={() => toggleGroup(extensions)}><TypeGlyph type={type} /><span>{t(primaryLabels[type])}</span></button>; })}
        <button type="button" className={otherTypes.some((type) => getOtherFileTypeExtensions(availableFormats, type).some((extension) => selected.has(extension))) ? "is-selected" : ""} aria-expanded={flyout?.kind === "other"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => openFlyout("other", event)}><TypeGlyph type="other" /><span>{t("explore.fileTypes.other")}</span></button>
      </div>
    </section>
    <StableImageFilters search={search} onSearchOptionsChange={onSearchOptionsChange} />
    {flyout?.kind === "dates" && <StableSidebarFlyout anchor={flyout.anchor} label={t("explore.editTime")} placement="below" align="start" width={360} maximumHeight={220} className="cap-stable-explore-flyout" onClose={() => setFlyout(null)}>
      <div className="cap-stable-date-fields"><label>{t("explore.startDate")}<input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>{t("explore.endDate")}<input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} /></label></div>
      <div className="cap-stable-flyout-actions"><button type="button" onClick={() => setFlyout(null)}>{t("common.cancel")}</button><button type="button" className="is-selected" onClick={applyDateRange}>{t("common.confirm")}</button></div>
    </StableSidebarFlyout>}
    {flyout?.kind === "formats" && <StableSidebarFlyout anchor={flyout.anchor} label={t("explore.editFormats")} placement="below" align="start" width={460} maximumHeight={520} className="cap-stable-explore-flyout cap-stable-format-flyout" onClose={() => setFlyout(null)}>
      {categoryOrder.map((category) => { const formats = formatGroups.get(category); return formats?.length ? <section key={category}><strong>{t(categoryLabels[category])}</strong><div>{formats.map((format) => { const extensions = getExtensionsForCanonicalFormat(format); return <button type="button" className={isGroupSelected(new Set(formatDraft), extensions) ? "is-selected" : ""} key={format} onClick={() => updateFormatDraft(format)}>{format.toUpperCase()}</button>; })}</div></section> : null; })}
      <div className="cap-stable-flyout-actions"><button type="button" onClick={() => setFormatDraft([])}>{t("explore.clearFilters")}</button><button type="button" className="is-selected" onClick={() => { const preserveImageFilters = isImageOnlyExtensionSelection(formatDraft); applySearch({ ...search, selectedExtensions: formatDraft.length ? [...formatDraft].sort() : undefined, visualColors: preserveImageFilters ? search.visualColors : undefined, imageAspectRatios: preserveImageFilters ? search.imageAspectRatios : undefined }); setFlyout(null); }}>{t("common.confirm")}</button></div>
    </StableSidebarFlyout>}
    {flyout?.kind === "other" && <StableSidebarFlyout anchor={flyout.anchor} label={t("explore.fileTypes.other")} placement="below" align="end" width={390} maximumHeight={240} className="cap-stable-explore-flyout cap-stable-other-flyout" onClose={() => setFlyout(null)}>
      {otherTypes.map((type) => { const extensions = getOtherFileTypeExtensions(availableFormats, type); return <button type="button" className={isGroupSelected(selected, extensions) ? "is-selected" : ""} disabled={extensions.length === 0} key={type} onClick={() => toggleGroup(extensions)}>{t(otherLabels[type])}</button>; })}
    </StableSidebarFlyout>}
  </div>;
};

export default StableExploreFilters;
