import StableFilterOptionIcon from "./StableFilterOptionIcon";
import { useState, type MouseEvent } from "react";
import { normalizeImageDimensionFilter, type SearchImageDimensionFilter } from "../../../electron/imageSearchFilters";
import { t, type TranslationKey } from "../../../electron/localization";
import type { SearchState } from "../../shared/types";
import StableFilterEditGlyph from "./StableFilterEditGlyph";
import StableSidebarFlyout from "./StableSidebarFlyout";
import { formatDimensionSummary } from "./imageFilterOptions";
import "./StableImageDimensionFilter.css";
type DimensionDraft = { mode: "range" | "exact"; minWidth: string; minHeight: string; maxWidth: string; maxHeight: string; width: string; height: string };
const emptyDraft = (): DimensionDraft => ({ mode: "range", minWidth: "", minHeight: "", maxWidth: "", maxHeight: "", width: "", height: "" });
const toDraft = (filter?: SearchImageDimensionFilter): DimensionDraft => filter?.mode === "exact"
  ? { ...emptyDraft(), mode: "exact", width: String(filter.width), height: String(filter.height) }
  : { ...emptyDraft(), ...Object.fromEntries(Object.entries(filter ?? {}).map(([key, value]) => [key, String(value)])), mode: "range" };
const toNumber = (value: string) => value ? Number(value) : undefined;
const toFilter = (draft: DimensionDraft) => normalizeImageDimensionFilter(draft.mode === "exact"
  ? { mode: "exact", width: toNumber(draft.width), height: toNumber(draft.height) }
  : { mode: "range", minWidth: toNumber(draft.minWidth), minHeight: toNumber(draft.minHeight), maxWidth: toNumber(draft.maxWidth), maxHeight: toNumber(draft.maxHeight) });
const rangeFields: Array<{ key: "minWidth" | "minHeight" | "maxWidth" | "maxHeight"; label: TranslationKey }> = [
  { key: "minWidth", label: "explore.minimumWidth" }, { key: "minHeight", label: "explore.minimumHeight" },
  { key: "maxWidth", label: "explore.maximumWidth" }, { key: "maxHeight", label: "explore.maximumHeight" }
];
const StableImageDimensionFilter = ({ search, onFlyoutOpen, onSearchOptionsChange }: { search: SearchState; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void }) => {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [draft, setDraft] = useState<DimensionDraft>(() => toDraft(search.imageDimensionFilter));
  const open = (event: MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); onFlyoutOpen(); setDraft(toDraft(search.imageDimensionFilter)); setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect()); };
  const update = (key: keyof DimensionDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const commit = () => { const filter = toFilter(draft); if (!filter) return; onSearchOptionsChange({ ...search, imageDimensionFilter: filter }); setAnchor(null); };
  return <section className="cap-stable-image-dimension-filter">
    <header><strong>{t("explore.imageDimensions")}</strong><button type="button" title={t("explore.editImageDimensions")} aria-label={t("explore.editImageDimensions")} aria-expanded={anchor !== null} onPointerDown={(event) => event.stopPropagation()} onClick={open}><StableFilterEditGlyph /></button></header>
    <button type="button" className={`cap-stable-dimension-summary${search.imageDimensionFilter ? " is-selected" : ""}`} onClick={open}><StableFilterOptionIcon name="dimensions" /><span>{search.imageDimensionFilter ? formatDimensionSummary(search.imageDimensionFilter) : t("explore.unlimitedDimensions")}</span></button>
    {anchor && <StableSidebarFlyout anchor={anchor} label={t("explore.editImageDimensions")} placement="below" align="start" width={320} maximumHeight={390} className="cap-stable-explore-flyout cap-stable-image-flyout" onClose={() => setAnchor(null)}>
      <div className="cap-stable-dimension-modes"><button type="button" className={draft.mode === "range" ? "is-selected" : ""} onClick={() => setDraft((current) => ({ ...current, mode: "range" }))}>{t("explore.dimensionRange")}</button><button type="button" className={draft.mode === "exact" ? "is-selected" : ""} onClick={() => setDraft((current) => ({ ...current, mode: "exact" }))}>{t("explore.dimensionExact")}</button></div>
      {draft.mode === "range" ? <><div className="cap-stable-size-shortcuts"><button type="button" onClick={() => setDraft({ ...emptyDraft(), minWidth: "1920", minHeight: "1080" })}>≥ 1920 × 1080</button><button type="button" onClick={() => setDraft({ ...emptyDraft(), minWidth: "3840", minHeight: "2160" })}>≥ 3840 × 2160</button></div><div className="cap-stable-dimension-fields">{rangeFields.map(({ key, label }) => <label key={key}>{t(label)}<input type="number" min="1" max="100000" value={draft[key]} onChange={(event) => update(key, event.target.value)} /></label>)}</div></> : <div className="cap-stable-inline-number-fields cap-stable-exact-size"><label>{t("explore.imageWidth")}<input type="number" min="1" max="100000" value={draft.width} onChange={(event) => update("width", event.target.value)} /></label><b>×</b><label>{t("explore.imageHeight")}<input type="number" min="1" max="100000" value={draft.height} onChange={(event) => update("height", event.target.value)} /></label></div>}
      <div className="cap-stable-flyout-actions"><button type="button" onClick={() => { onSearchOptionsChange({ ...search, imageDimensionFilter: undefined }); setAnchor(null); }}>{t("explore.clearFilters")}</button><button type="button" className="is-selected" disabled={!toFilter(draft)} onClick={commit}>{t("common.confirm")}</button></div>
    </StableSidebarFlyout>}
  </section>;
};
export default StableImageDimensionFilter;
