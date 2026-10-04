import { useState, type MouseEvent } from "react";
import { searchArtboardCountPresets } from "../../../electron/artboardSearchFilters";
import { t, type TranslationKey } from "../../../electron/localization";
import { normalizeSearchCountRange } from "../../../electron/textDataSearchFilters";
import type { SearchState } from "../../shared/types";
import { isArtboardDocumentOnlyExtensionSelection } from "./exploreFormatFilters";
import StableFilterEditGlyph from "./StableFilterEditGlyph";
import StableSidebarFlyout from "./StableSidebarFlyout";
import "./StableArtboardFilter.css";

const countLabels: Record<(typeof searchArtboardCountPresets)[number], TranslationKey> = {
  one: "explore.count.one",
  "2-5": "explore.count.twoToFive",
  "6-10": "explore.count.sixToTen",
  "11-20": "explore.count.elevenToTwenty",
  "over-20": "explore.count.overTwenty"
};
const toNumber = (value: string) => value ? Number(value) : undefined;

const StableArtboardFilter = ({ search, onFlyoutOpen, onSearchOptionsChange }: { search: SearchState; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void }) => {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [minimumCount, setMinimumCount] = useState("");
  const [maximumCount, setMaximumCount] = useState("");
  if (!isArtboardDocumentOnlyExtensionSelection(search.selectedExtensions ?? [])) return null;

  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onFlyoutOpen();
    setMinimumCount(String(search.artboardCountRange?.minCount ?? ""));
    setMaximumCount(String(search.artboardCountRange?.maxCount ?? ""));
    setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect());
  };
  const countRange = normalizeSearchCountRange({ minCount: toNumber(minimumCount), maxCount: toNumber(maximumCount) });
  return <section className="cap-stable-artboard-count-filter">
    <header><strong>{t("explore.artboardCount")}</strong><button type="button" title={t("explore.editArtboardCount")} aria-label={t("explore.editArtboardCount")} aria-expanded={Boolean(anchor)} onPointerDown={(event) => event.stopPropagation()} onClick={open}><StableFilterEditGlyph /></button></header>
    <div className="cap-stable-artboard-count-options">{searchArtboardCountPresets.map((preset) => <button type="button" className={search.artboardCountPreset === preset ? "is-selected" : ""} aria-pressed={search.artboardCountPreset === preset} key={preset} onClick={() => onSearchOptionsChange({ ...search, artboardCountPreset: search.artboardCountPreset === preset ? undefined : preset, artboardCountRange: undefined })}>{t(countLabels[preset])}</button>)}</div>
    {anchor && <StableSidebarFlyout anchor={anchor} label={t("explore.editArtboardCount")} placement="below" align="start" width={360} maximumHeight={220} className="cap-stable-explore-flyout cap-stable-artboard-count-flyout" onClose={() => setAnchor(null)}>
      <div className="cap-stable-artboard-count-fields"><label>{t("explore.minimumCount")}<input type="number" min="0" max="100000" step="1" value={minimumCount} onChange={(event) => setMinimumCount(event.target.value)} /></label><label>{t("explore.maximumCount")}<input type="number" min="0" max="100000" step="1" value={maximumCount} onChange={(event) => setMaximumCount(event.target.value)} /></label></div>
      <div className="cap-stable-flyout-actions"><button type="button" onClick={() => { onSearchOptionsChange({ ...search, artboardCountPreset: undefined, artboardCountRange: undefined }); setAnchor(null); }}>{t("explore.clearFilters")}</button><button type="button" className="is-selected" disabled={!countRange} onClick={() => { if (!countRange) return; onSearchOptionsChange({ ...search, artboardCountPreset: undefined, artboardCountRange: countRange }); setAnchor(null); }}>{t("common.confirm")}</button></div>
    </StableSidebarFlyout>}
  </section>;
};

export default StableArtboardFilter;
