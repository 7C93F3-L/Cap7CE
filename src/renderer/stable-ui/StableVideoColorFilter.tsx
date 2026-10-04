import { useState, type CSSProperties, type MouseEvent } from "react";
import { searchVideoColorTraits, searchVideoVisualColors } from "../../../electron/videoSearchFilters";
import { t } from "../../../electron/localization";
import type { SearchState } from "../../shared/types";
import StableFilterEditGlyph from "./StableFilterEditGlyph";
import StableSidebarFlyout from "./StableSidebarFlyout";
import { colorLabels, colorTraitLabels, toggleValue } from "./imageFilterOptions";

const StableVideoColorFilter = ({ search, onFlyoutOpen, onSearchOptionsChange }: {
  search: SearchState;
  onFlyoutOpen: () => void;
  onSearchOptionsChange: (search: SearchState) => void;
}) => {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [draft, setDraft] = useState(search.videoColorTraits ?? []);
  const colors = search.videoVisualColors ?? [];
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onFlyoutOpen();
    setDraft(search.videoColorTraits ?? []);
    setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect());
  };
  return <section className="cap-stable-video-color-filter">
    <header><strong>{t("explore.videoColors")}</strong><button type="button" title={t("explore.editVideoColors")} aria-label={t("explore.editVideoColors")} aria-expanded={anchor !== null} onPointerDown={(event) => event.stopPropagation()} onClick={open}><StableFilterEditGlyph /></button></header>
    <div className="cap-stable-color-options">{searchVideoVisualColors.map((color) => <button type="button" className={colors.includes(color) ? `is-selected is-${color}` : `is-${color}`} style={{ "--cap-color-swatch": `var(--cap-image-color-${color}, transparent)` } as CSSProperties} title={t(colorLabels[color])} aria-label={t(colorLabels[color])} aria-pressed={colors.includes(color)} key={color} onClick={() => { const next = toggleValue(colors, color); onSearchOptionsChange({ ...search, videoVisualColors: next.length ? next : undefined }); }} />)}</div>
    {anchor && <StableSidebarFlyout anchor={anchor} label={t("explore.editVideoColors")} placement="below" align="start" width={330} maximumHeight={220} className="cap-stable-explore-flyout cap-stable-video-flyout" onClose={() => setAnchor(null)}>
      <strong>{t("explore.colorCharacteristics")}</strong><div className="cap-stable-image-choice-grid">{searchVideoColorTraits.map((trait) => <button type="button" className={draft.includes(trait) ? "is-selected" : ""} aria-pressed={draft.includes(trait)} key={trait} onClick={() => setDraft(toggleValue(draft, trait))}>{t(colorTraitLabels[trait])}</button>)}</div>
      <div className="cap-stable-flyout-actions"><button type="button" onClick={() => setDraft([])}>{t("explore.clearFilters")}</button><button type="button" className="is-selected" onClick={() => { onSearchOptionsChange({ ...search, videoColorTraits: draft.length ? draft : undefined }); setAnchor(null); }}>{t("common.confirm")}</button></div>
    </StableSidebarFlyout>}
  </section>;
};

export default StableVideoColorFilter;
