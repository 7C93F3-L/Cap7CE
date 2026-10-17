import StableFilterOptionIcon from "./StableFilterOptionIcon";
import { useState, type MouseEvent } from "react";
import {
  normalizeThreeDTriangleCountRange,
  searchThreeDModelTypes,
  searchThreeDStructures,
  searchThreeDTriangleCountPresets,
  type SearchThreeDModelType,
  type SearchThreeDStructure
} from "../../../electron/threeDSearchFilters";
import { supportedThreeDFactExtensions } from "../../../electron/threeDFactTypes";
import { t, type TranslationKey } from "../../../electron/localization";
import type { SearchState } from "../../shared/types";
import { isThreeDOnlyExtensionSelection } from "./exploreFormatFilters";
import { toggleValue } from "./imageFilterOptions";
import StableFilterEditGlyph from "./StableFilterEditGlyph";
import StableSidebarFlyout from "./StableSidebarFlyout";
import "./StableThreeDFilters.css";

const modelTypeLabels: Record<SearchThreeDModelType, TranslationKey> = {
  polygon: "explore.threeDModelType.polygon",
  cad: "explore.threeDModelType.cad",
  scene: "explore.threeDModelType.scene"
};
const structureLabels: Record<SearchThreeDStructure, TranslationKey> = {
  static: "explore.threeDStructure.static",
  animated: "explore.threeDStructure.animated",
  rigged: "explore.threeDStructure.rigged"
};
const triangleLabels: Record<(typeof searchThreeDTriangleCountPresets)[number], TranslationKey> = {
  "under-10k": "explore.threeDTriangleCount.underTenThousand",
  "10k-100k": "explore.threeDTriangleCount.tenToHundredThousand",
  "100k-1m": "explore.threeDTriangleCount.hundredThousandToMillion",
  "over-1m": "explore.threeDTriangleCount.overMillion"
};
const toNumber = (value: string) => value ? Number(value) : undefined;

const StableThreeDFilters = ({ search, onFlyoutOpen, onSearchOptionsChange }: { search: SearchState; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void }) => {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [minimumCount, setMinimumCount] = useState("");
  const [maximumCount, setMaximumCount] = useState("");
  const selectedExtensions = search.selectedExtensions ?? [];
  if (!isThreeDOnlyExtensionSelection(selectedExtensions)) return null;
  const hasMetadataSupport = selectedExtensions.some((extension) => supportedThreeDFactExtensions.includes(extension as (typeof supportedThreeDFactExtensions)[number]));

  const openTriangleRange = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onFlyoutOpen();
    setMinimumCount(String(search.threeDTriangleCountRange?.minCount ?? ""));
    setMaximumCount(String(search.threeDTriangleCountRange?.maxCount ?? ""));
    setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect());
  };
  const triangleRange = normalizeThreeDTriangleCountRange({ minCount: toNumber(minimumCount), maxCount: toNumber(maximumCount) });
  const selectedModelTypes = search.threeDModelTypes ?? [];
  const selectedStructures = search.threeDStructures ?? [];
  return <>
    <section className="cap-stable-three-d-model-type-filter">
      <header><strong>{t("explore.threeDModelType")}</strong></header>
      <div className="cap-stable-three-d-model-type-options">{searchThreeDModelTypes.map((value) => <button type="button" className={selectedModelTypes.includes(value) ? "is-selected" : ""} aria-pressed={selectedModelTypes.includes(value)} key={value} onClick={() => { const next = toggleValue(selectedModelTypes, value); onSearchOptionsChange({ ...search, threeDModelTypes: next.length ? next : undefined }); }}><StableFilterOptionIcon name={value} /><span>{t(modelTypeLabels[value])}</span></button>)}</div>
    </section>
    {hasMetadataSupport && <section className="cap-stable-three-d-structure-filter">
      <header><strong>{t("explore.threeDStructure")}</strong></header>
      <div className="cap-stable-three-d-structure-options">{searchThreeDStructures.map((value) => <button type="button" className={selectedStructures.includes(value) ? "is-selected" : ""} aria-pressed={selectedStructures.includes(value)} key={value} onClick={() => { const next = toggleValue(selectedStructures, value); onSearchOptionsChange({ ...search, threeDStructures: next.length ? next : undefined }); }}><StableFilterOptionIcon name={value} /><span>{t(structureLabels[value])}</span></button>)}</div>
    </section>}
    {hasMetadataSupport && <section className="cap-stable-three-d-triangle-filter">
      <header><strong>{t("explore.threeDTriangleCount")}</strong><button type="button" title={t("explore.editThreeDTriangleCount")} aria-label={t("explore.editThreeDTriangleCount")} aria-expanded={Boolean(anchor)} onPointerDown={(event) => event.stopPropagation()} onClick={openTriangleRange}><StableFilterEditGlyph /></button></header>
      <div className="cap-stable-three-d-triangle-options">{searchThreeDTriangleCountPresets.map((preset) => <button type="button" className={search.threeDTriangleCountPreset === preset ? "is-selected" : ""} aria-pressed={search.threeDTriangleCountPreset === preset} key={preset} onClick={() => onSearchOptionsChange({ ...search, threeDTriangleCountPreset: search.threeDTriangleCountPreset === preset ? undefined : preset, threeDTriangleCountRange: undefined })}>{t(triangleLabels[preset])}</button>)}</div>
      {anchor && <StableSidebarFlyout anchor={anchor} label={t("explore.editThreeDTriangleCount")} placement="below" align="start" width={360} maximumHeight={220} className="cap-stable-explore-flyout cap-stable-three-d-triangle-flyout" onClose={() => setAnchor(null)}>
        <div className="cap-stable-three-d-triangle-fields"><label>{t("explore.minimumCount")}<input type="number" min="0" max="2000000000" step="1" value={minimumCount} onChange={(event) => setMinimumCount(event.target.value)} /></label><label>{t("explore.maximumCount")}<input type="number" min="0" max="2000000000" step="1" value={maximumCount} onChange={(event) => setMaximumCount(event.target.value)} /></label></div>
        <div className="cap-stable-flyout-actions"><button type="button" onClick={() => { onSearchOptionsChange({ ...search, threeDTriangleCountPreset: undefined, threeDTriangleCountRange: undefined }); setAnchor(null); }}>{t("explore.clearFilters")}</button><button type="button" className="is-selected" disabled={!triangleRange} onClick={() => { if (!triangleRange) return; onSearchOptionsChange({ ...search, threeDTriangleCountPreset: undefined, threeDTriangleCountRange: triangleRange }); setAnchor(null); }}>{t("common.confirm")}</button></div>
      </StableSidebarFlyout>}
    </section>}
  </>;
};

export default StableThreeDFilters;
