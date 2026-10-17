import StableFilterOptionIcon from "./StableFilterOptionIcon";
import { useState, type MouseEvent } from "react";
import { normalizeImageAspectRatioValue, searchImageAspectRatios, type SearchImageAspectRatioValue } from "../../../electron/imageSearchFilters";
import { t } from "../../../electron/localization";
import type { SearchState } from "../../shared/types";
import StableFilterEditGlyph from "./StableFilterEditGlyph";
import StableSidebarFlyout from "./StableSidebarFlyout";
import { commonAspectRatios, ratioLabels, ratioValueKey, toggleRatioValue, toggleValue } from "./imageFilterOptions";
const StableImageRatioFilter = ({ search, onFlyoutOpen, onSearchOptionsChange }: { search: SearchState; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void }) => {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [draft, setDraft] = useState<SearchImageAspectRatioValue[]>(search.imageAspectRatioValues ?? []);
  const [customWidth, setCustomWidth] = useState("");
  const [customHeight, setCustomHeight] = useState("");
  const selected = search.imageAspectRatios ?? [];
  const open = (event: MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); onFlyoutOpen(); setDraft(search.imageAspectRatioValues ?? []); setCustomWidth(""); setCustomHeight(""); setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect()); };
  const addCustomRatio = () => { const ratio = normalizeImageAspectRatioValue({ width: Number(customWidth), height: Number(customHeight) }); if (!ratio) return; setDraft((current) => current.some((item) => ratioValueKey(item) === ratioValueKey(ratio)) ? current : [...current, ratio]); setCustomWidth(""); setCustomHeight(""); };
  const customRatios = draft.filter((ratio) => !commonAspectRatios.some((common) => ratioValueKey(common) === ratioValueKey(ratio)));
  return <section className="cap-stable-image-ratio-filter">
    <header><strong>{t("explore.imageRatios")}</strong><button type="button" title={t("explore.editImageRatios")} aria-label={t("explore.editImageRatios")} aria-expanded={anchor !== null} onPointerDown={(event) => event.stopPropagation()} onClick={open}><StableFilterEditGlyph /></button></header>
    <div className="cap-stable-ratio-options">{searchImageAspectRatios.map((ratio) => <button type="button" className={selected.includes(ratio) ? "is-selected" : ""} aria-pressed={selected.includes(ratio)} key={ratio} onClick={() => { const imageAspectRatios = toggleValue(selected, ratio); onSearchOptionsChange({ ...search, imageAspectRatios: imageAspectRatios.length ? imageAspectRatios : undefined }); }}><StableFilterOptionIcon name={ratio} /><span>{t(ratioLabels[ratio])}</span></button>)}</div>
    {anchor && <StableSidebarFlyout anchor={anchor} label={t("explore.editImageRatios")} placement="below" align="start" width={320} maximumHeight={350} className="cap-stable-explore-flyout cap-stable-image-flyout" onClose={() => setAnchor(null)}>
      <strong>{t("explore.commonRatios")}</strong><div className="cap-stable-ratio-chip-grid">{commonAspectRatios.map((ratio) => { const active = draft.some((item) => ratioValueKey(item) === ratioValueKey(ratio)); return <button type="button" className={active ? "is-selected" : ""} aria-pressed={active} key={ratioValueKey(ratio)} onClick={() => setDraft(toggleRatioValue(draft, ratio))}>{ratioValueKey(ratio)}</button>; })}</div>
      <strong>{t("explore.customRatio")}</strong><div className="cap-stable-inline-number-fields"><label>{t("explore.ratioWidth")}<input type="number" min="1" max="100000" value={customWidth} onChange={(event) => setCustomWidth(event.target.value)} /></label><b>:</b><label>{t("explore.ratioHeight")}<input type="number" min="1" max="100000" value={customHeight} onChange={(event) => setCustomHeight(event.target.value)} /></label><button type="button" disabled={!customWidth || !customHeight} onClick={addCustomRatio}>{t("common.add")}</button></div>
      {customRatios.length > 0 && <div className="cap-stable-custom-ratios">{customRatios.map((ratio) => <button type="button" key={ratioValueKey(ratio)} onClick={() => setDraft(toggleRatioValue(draft, ratio))}>{ratioValueKey(ratio)} ×</button>)}</div>}
      <div className="cap-stable-flyout-actions"><button type="button" onClick={() => setDraft([])}>{t("explore.clearFilters")}</button><button type="button" className="is-selected" onClick={() => { onSearchOptionsChange({ ...search, imageAspectRatioValues: draft.length ? draft : undefined }); setAnchor(null); }}>{t("common.confirm")}</button></div>
    </StableSidebarFlyout>}
  </section>;
};
export default StableImageRatioFilter;
