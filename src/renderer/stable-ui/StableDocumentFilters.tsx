import { useState, type MouseEvent } from "react";
import {
  normalizeDocumentContentCountRange,
  searchDocumentContentCountPresets
} from "../../../electron/documentSearchFilters";
import { t, type TranslationKey } from "../../../electron/localization";
import type { SearchState } from "../../shared/types";
import { isDocumentOnlyExtensionSelection } from "./exploreFormatFilters";
import StableFilterEditGlyph from "./StableFilterEditGlyph";
import StableSidebarFlyout from "./StableSidebarFlyout";
import "./StableDocumentFilters.css";

const countLabels: Record<(typeof searchDocumentContentCountPresets)[number], TranslationKey> = {
  one: "explore.documentContentCount.one",
  "2-10": "explore.documentContentCount.twoToTen",
  "11-50": "explore.documentContentCount.elevenToFifty",
  "51-100": "explore.documentContentCount.fiftyOneToHundred",
  "over-100": "explore.documentContentCount.overHundred"
};
const toNumber = (value: string) => value ? Number(value) : undefined;

const StableDocumentFilters = ({ search, onFlyoutOpen, onSearchOptionsChange }: { search: SearchState; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void }) => {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [minimumCount, setMinimumCount] = useState("");
  const [maximumCount, setMaximumCount] = useState("");
  if (!isDocumentOnlyExtensionSelection(search.selectedExtensions ?? [])) return null;

  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onFlyoutOpen();
    setMinimumCount(String(search.documentContentCountRange?.minCount ?? ""));
    setMaximumCount(String(search.documentContentCountRange?.maxCount ?? ""));
    setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect());
  };
  const countRange = normalizeDocumentContentCountRange({ minCount: toNumber(minimumCount), maxCount: toNumber(maximumCount) });
  return <section className="cap-stable-document-count-filter">
    <header><strong>{t("explore.documentContentCount")}</strong><button type="button" title={t("explore.editDocumentContentCount")} aria-label={t("explore.editDocumentContentCount")} aria-expanded={Boolean(anchor)} onPointerDown={(event) => event.stopPropagation()} onClick={open}><StableFilterEditGlyph /></button></header>
    <div className="cap-stable-document-count-options">{searchDocumentContentCountPresets.map((preset) => <button type="button" className={search.documentContentCountPreset === preset ? "is-selected" : ""} aria-pressed={search.documentContentCountPreset === preset} key={preset} onClick={() => onSearchOptionsChange({ ...search, documentContentCountPreset: search.documentContentCountPreset === preset ? undefined : preset, documentContentCountRange: undefined })}>{t(countLabels[preset])}</button>)}</div>
    {anchor && <StableSidebarFlyout anchor={anchor} label={t("explore.editDocumentContentCount")} placement="below" align="start" width={360} maximumHeight={220} className="cap-stable-explore-flyout cap-stable-document-count-flyout" onClose={() => setAnchor(null)}>
      <div className="cap-stable-document-count-fields"><label>{t("explore.minimumContentCount")}<input type="number" min="1" max="100000" step="1" value={minimumCount} onChange={(event) => setMinimumCount(event.target.value)} /></label><label>{t("explore.maximumContentCount")}<input type="number" min="1" max="100000" step="1" value={maximumCount} onChange={(event) => setMaximumCount(event.target.value)} /></label></div>
      <div className="cap-stable-flyout-actions"><button type="button" onClick={() => { onSearchOptionsChange({ ...search, documentContentCountPreset: undefined, documentContentCountRange: undefined }); setAnchor(null); }}>{t("explore.clearFilters")}</button><button type="button" className="is-selected" disabled={!countRange} onClick={() => { if (!countRange) return; onSearchOptionsChange({ ...search, documentContentCountPreset: undefined, documentContentCountRange: countRange }); setAnchor(null); }}>{t("common.confirm")}</button></div>
    </StableSidebarFlyout>}
  </section>;
};

export default StableDocumentFilters;
