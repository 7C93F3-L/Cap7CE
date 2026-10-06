import { useState, type MouseEvent } from "react";
import {
  normalizeVideoAspectRatioValue,
  normalizeVideoDimensionFilter,
  normalizeVideoDurationRange,
  searchVideoAspectRatios,
  searchVideoDurationPresets,
  searchVideoResolutions,
  type SearchVideoAspectRatioValue,
  type SearchVideoDimensionFilter
} from "../../../electron/videoSearchFilters";
import { t, type TranslationKey } from "../../../electron/localization";
import type { SearchState } from "../../shared/types";
import StableFilterEditGlyph from "./StableFilterEditGlyph";
import StableSidebarFlyout from "./StableSidebarFlyout";
import { commonAspectRatios, ratioLabels, ratioValueKey, toggleValue } from "./imageFilterOptions";
import { isVideoOnlyExtensionSelection } from "./exploreFormatFilters";
import StableVideoColorFilter from "./StableVideoColorFilter";
import "./StableVideoFilters.css";

type FlyoutKind = "duration" | "ratio" | "resolution";
type AnchorState = { kind: FlyoutKind; rect: DOMRect } | null;
type DimensionDraft = { minWidth: string; minHeight: string; maxWidth: string; maxHeight: string };
const emptyDimensions = (): DimensionDraft => ({ minWidth: "", minHeight: "", maxWidth: "", maxHeight: "" });
const durationLabels: Record<(typeof searchVideoDurationPresets)[number], TranslationKey> = {
  "under-15s": "explore.videoDuration.under15", "15s-1m": "explore.videoDuration.underMinute",
  "1m-5m": "explore.videoDuration.oneToFive", "over-5m": "explore.videoDuration.overFive"
};
const toNumber = (value: string) => value ? Number(value) : undefined;
const toDimensionDraft = (filter?: SearchVideoDimensionFilter): DimensionDraft => filter?.mode === "range"
  ? { minWidth: String(filter.minWidth ?? ""), minHeight: String(filter.minHeight ?? ""), maxWidth: String(filter.maxWidth ?? ""), maxHeight: String(filter.maxHeight ?? "") }
  : emptyDimensions();
const toDimensionFilter = (draft: DimensionDraft) => normalizeVideoDimensionFilter({ mode: "range", ...Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, toNumber(value)])) });

const StableVideoFilters = ({ search, allowColors = true, onFlyoutOpen, onSearchOptionsChange }: { search: SearchState; allowColors?: boolean; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void }) => {
  const [anchor, setAnchor] = useState<AnchorState>(null);
  const [minimumSeconds, setMinimumSeconds] = useState("");
  const [maximumSeconds, setMaximumSeconds] = useState("");
  const [ratioDraft, setRatioDraft] = useState<SearchVideoAspectRatioValue[]>(search.videoAspectRatioValues ?? []);
  const [ratioWidth, setRatioWidth] = useState("");
  const [ratioHeight, setRatioHeight] = useState("");
  const [dimensionDraft, setDimensionDraft] = useState<DimensionDraft>(() => toDimensionDraft(search.videoDimensionFilter));
  if (!isVideoOnlyExtensionSelection(search.selectedExtensions ?? [])) return null;

  const open = (kind: FlyoutKind, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onFlyoutOpen();
    if (kind === "duration") {
      setMinimumSeconds(String(search.videoDurationRange?.minSeconds ?? ""));
      setMaximumSeconds(String(search.videoDurationRange?.maxSeconds ?? ""));
    } else if (kind === "ratio") {
      setRatioDraft(search.videoAspectRatioValues ?? []); setRatioWidth(""); setRatioHeight("");
    } else setDimensionDraft(toDimensionDraft(search.videoDimensionFilter));
    setAnchor(anchor?.kind === kind ? null : { kind, rect: event.currentTarget.getBoundingClientRect() });
  };
  const durationRange = normalizeVideoDurationRange({ minSeconds: toNumber(minimumSeconds), maxSeconds: toNumber(maximumSeconds) });
  const addRatio = () => {
    const value = normalizeVideoAspectRatioValue({ width: Number(ratioWidth), height: Number(ratioHeight) });
    if (!value || ratioDraft.some((ratio) => ratioValueKey(ratio) === ratioValueKey(value))) return;
    setRatioDraft((current) => [...current, value]); setRatioWidth(""); setRatioHeight("");
  };
  const selectedRatios = search.videoAspectRatios ?? [];
  const selectedResolutions = search.videoResolutions ?? [];
  return <>
    <section className="cap-stable-video-duration-filter">
      <header><strong>{t("explore.videoDuration")}</strong><button type="button" title={t("explore.editVideoDuration")} aria-label={t("explore.editVideoDuration")} aria-expanded={anchor?.kind === "duration"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => open("duration", event)}><StableFilterEditGlyph /></button></header>
      <div className="cap-stable-video-duration-options">{searchVideoDurationPresets.map((preset) => <button type="button" className={search.videoDurationPreset === preset ? "is-selected" : ""} aria-pressed={search.videoDurationPreset === preset} key={preset} onClick={() => onSearchOptionsChange({ ...search, videoDurationPreset: search.videoDurationPreset === preset ? undefined : preset, videoDurationRange: undefined })}>{t(durationLabels[preset])}</button>)}</div>
    </section>
    <section className="cap-stable-video-ratio-filter">
      <header><strong>{t("explore.videoRatios")}</strong><button type="button" title={t("explore.editVideoRatios")} aria-label={t("explore.editVideoRatios")} aria-expanded={anchor?.kind === "ratio"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => open("ratio", event)}><StableFilterEditGlyph /></button></header>
      <div className="cap-stable-video-ratio-options">{searchVideoAspectRatios.map((ratio) => <button type="button" className={selectedRatios.includes(ratio) ? "is-selected" : ""} aria-pressed={selectedRatios.includes(ratio)} key={ratio} onClick={() => { const next = toggleValue(selectedRatios, ratio); onSearchOptionsChange({ ...search, videoAspectRatios: next.length ? next : undefined }); }}><i className={`is-${ratio}`} aria-hidden="true" /><span>{t(ratioLabels[ratio])}</span></button>)}</div>
    </section>
    <section className="cap-stable-video-resolution-filter">
      <header><strong>{t("explore.videoResolution")}</strong><button type="button" title={t("explore.editVideoResolution")} aria-label={t("explore.editVideoResolution")} aria-expanded={anchor?.kind === "resolution"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => open("resolution", event)}><StableFilterEditGlyph /></button></header>
      <div className="cap-stable-video-resolution-options">{searchVideoResolutions.map((resolution) => <button type="button" className={selectedResolutions.includes(resolution) ? "is-selected" : ""} aria-pressed={selectedResolutions.includes(resolution)} key={resolution} onClick={() => { const next = toggleValue(selectedResolutions, resolution); onSearchOptionsChange({ ...search, videoResolutions: next.length ? next : undefined, videoDimensionFilter: undefined }); }}>{resolution.toUpperCase()}</button>)}</div>
    </section>
    {allowColors && <StableVideoColorFilter search={search} onFlyoutOpen={() => setAnchor(null)} onSearchOptionsChange={onSearchOptionsChange} />}
    {anchor?.kind === "duration" && <StableSidebarFlyout anchor={anchor.rect} label={t("explore.editVideoDuration")} placement="below" align="start" width={360} maximumHeight={220} className="cap-stable-explore-flyout cap-stable-video-flyout" onClose={() => setAnchor(null)}>
      <div className="cap-stable-video-duration-fields"><label>{t("explore.minimumSeconds")}<input type="number" min="0" max="604800" value={minimumSeconds} onChange={(event) => setMinimumSeconds(event.target.value)} /></label><label>{t("explore.maximumSeconds")}<input type="number" min="1" max="604800" value={maximumSeconds} onChange={(event) => setMaximumSeconds(event.target.value)} /></label></div>
      <div className="cap-stable-flyout-actions"><button type="button" onClick={() => { onSearchOptionsChange({ ...search, videoDurationPreset: undefined, videoDurationRange: undefined }); setAnchor(null); }}>{t("explore.clearFilters")}</button><button type="button" className="is-selected" disabled={!durationRange} onClick={() => { if (!durationRange) return; onSearchOptionsChange({ ...search, videoDurationPreset: undefined, videoDurationRange: durationRange }); setAnchor(null); }}>{t("common.confirm")}</button></div>
    </StableSidebarFlyout>}
    {anchor?.kind === "ratio" && <StableSidebarFlyout anchor={anchor.rect} label={t("explore.editVideoRatios")} placement="below" align="start" width={430} maximumHeight={350} className="cap-stable-explore-flyout cap-stable-video-flyout" onClose={() => setAnchor(null)}>
      <strong>{t("explore.commonRatios")}</strong><div className="cap-stable-ratio-chip-grid">{commonAspectRatios.map((ratio) => { const active = ratioDraft.some((item) => ratioValueKey(item) === ratioValueKey(ratio)); return <button type="button" className={active ? "is-selected" : ""} key={ratioValueKey(ratio)} onClick={() => setRatioDraft((current) => active ? current.filter((item) => ratioValueKey(item) !== ratioValueKey(ratio)) : [...current, ratio])}>{ratioValueKey(ratio)}</button>; })}</div>
      <strong>{t("explore.customRatio")}</strong><div className="cap-stable-inline-number-fields"><label>{t("explore.ratioWidth")}<input type="number" min="1" max="100000" value={ratioWidth} onChange={(event) => setRatioWidth(event.target.value)} /></label><b>:</b><label>{t("explore.ratioHeight")}<input type="number" min="1" max="100000" value={ratioHeight} onChange={(event) => setRatioHeight(event.target.value)} /></label><button type="button" disabled={!ratioWidth || !ratioHeight} onClick={addRatio}>{t("common.add")}</button></div>
      <div className="cap-stable-flyout-actions"><button type="button" onClick={() => setRatioDraft([])}>{t("explore.clearFilters")}</button><button type="button" className="is-selected" onClick={() => { onSearchOptionsChange({ ...search, videoAspectRatioValues: ratioDraft.length ? ratioDraft : undefined }); setAnchor(null); }}>{t("common.confirm")}</button></div>
    </StableSidebarFlyout>}
    {anchor?.kind === "resolution" && <StableSidebarFlyout anchor={anchor.rect} label={t("explore.editVideoResolution")} placement="below" align="start" width={390} maximumHeight={310} className="cap-stable-explore-flyout cap-stable-video-flyout" onClose={() => setAnchor(null)}>
      <div className="cap-stable-size-shortcuts"><button type="button" onClick={() => setDimensionDraft({ minWidth: "1920", minHeight: "1080", maxWidth: "", maxHeight: "" })}>≥ 1920 × 1080</button><button type="button" onClick={() => setDimensionDraft({ minWidth: "3840", minHeight: "2160", maxWidth: "", maxHeight: "" })}>≥ 3840 × 2160</button></div>
      <div className="cap-stable-dimension-fields">{(["minWidth", "minHeight", "maxWidth", "maxHeight"] as const).map((key, index) => <label key={key}>{t((["explore.minimumWidth", "explore.minimumHeight", "explore.maximumWidth", "explore.maximumHeight"] as TranslationKey[])[index])}<input type="number" min="1" max="100000" value={dimensionDraft[key]} onChange={(event) => setDimensionDraft((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div>
      <div className="cap-stable-flyout-actions"><button type="button" onClick={() => { onSearchOptionsChange({ ...search, videoResolutions: undefined, videoDimensionFilter: undefined }); setAnchor(null); }}>{t("explore.clearFilters")}</button><button type="button" className="is-selected" disabled={!toDimensionFilter(dimensionDraft)} onClick={() => { const filter = toDimensionFilter(dimensionDraft); if (!filter) return; onSearchOptionsChange({ ...search, videoResolutions: undefined, videoDimensionFilter: filter }); setAnchor(null); }}>{t("common.confirm")}</button></div>
    </StableSidebarFlyout>}
  </>;
};

export default StableVideoFilters;
