import StableFilterOptionIcon from "./StableFilterOptionIcon";
import { useState, type MouseEvent } from "react";
import {
  normalizeAudioDurationRange,
  searchAudioChannels,
  searchAudioDurationPresets,
  type SearchAudioChannel
} from "../../../electron/audioSearchFilters";
import { t, type TranslationKey } from "../../../electron/localization";
import type { SearchState } from "../../shared/types";
import StableFilterEditGlyph from "./StableFilterEditGlyph";
import StableSidebarFlyout from "./StableSidebarFlyout";
import { isAudioOnlyExtensionSelection } from "./exploreFormatFilters";
import { toggleValue } from "./imageFilterOptions";
import "./StableAudioFilters.css";

const durationLabels: Record<(typeof searchAudioDurationPresets)[number], TranslationKey> = {
  "under-5s": "explore.audioDuration.underFive",
  "5s-30s": "explore.audioDuration.fiveToThirty",
  "30s-5m": "explore.audioDuration.thirtyToFiveMinutes",
  "over-5m": "explore.audioDuration.overFiveMinutes"
};
const channelLabels: Record<SearchAudioChannel, TranslationKey> = {
  mono: "explore.audioChannels.mono",
  stereo: "explore.audioChannels.stereo",
  multichannel: "explore.audioChannels.multichannel"
};
const toNumber = (value: string) => value ? Number(value) : undefined;

const StableAudioFilters = ({ search, onFlyoutOpen, onSearchOptionsChange }: { search: SearchState; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void }) => {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [minimumSeconds, setMinimumSeconds] = useState("");
  const [maximumSeconds, setMaximumSeconds] = useState("");
  if (!isAudioOnlyExtensionSelection(search.selectedExtensions ?? [])) return null;

  const openDuration = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onFlyoutOpen();
    setMinimumSeconds(String(search.audioDurationRange?.minSeconds ?? ""));
    setMaximumSeconds(String(search.audioDurationRange?.maxSeconds ?? ""));
    setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect());
  };
  const durationRange = normalizeAudioDurationRange({ minSeconds: toNumber(minimumSeconds), maxSeconds: toNumber(maximumSeconds) });
  const selectedChannels = search.audioChannels ?? [];
  return <>
    <section className="cap-stable-audio-duration-filter">
      <header><strong>{t("explore.audioDuration")}</strong><button type="button" title={t("explore.editAudioDuration")} aria-label={t("explore.editAudioDuration")} aria-expanded={Boolean(anchor)} onPointerDown={(event) => event.stopPropagation()} onClick={openDuration}><StableFilterEditGlyph /></button></header>
      <div className="cap-stable-audio-duration-options">{searchAudioDurationPresets.map((preset) => <button type="button" className={search.audioDurationPreset === preset ? "is-selected" : ""} aria-pressed={search.audioDurationPreset === preset} key={preset} onClick={() => onSearchOptionsChange({ ...search, audioDurationPreset: search.audioDurationPreset === preset ? undefined : preset, audioDurationRange: undefined })}>{t(durationLabels[preset])}</button>)}</div>
    </section>
    <section className="cap-stable-audio-channel-filter">
      <header><strong>{t("explore.audioChannels")}</strong></header>
      <div className="cap-stable-audio-channel-options">{searchAudioChannels.map((channel) => <button type="button" className={selectedChannels.includes(channel) ? "is-selected" : ""} aria-pressed={selectedChannels.includes(channel)} key={channel} onClick={() => { const next = toggleValue(selectedChannels, channel); onSearchOptionsChange({ ...search, audioChannels: next.length ? next : undefined }); }}><StableFilterOptionIcon name={channel} /><span>{t(channelLabels[channel])}</span></button>)}</div>
    </section>
    {anchor && <StableSidebarFlyout anchor={anchor} label={t("explore.editAudioDuration")} placement="below" align="start" width={320} maximumHeight={220} className="cap-stable-explore-flyout cap-stable-audio-flyout" onClose={() => setAnchor(null)}>
      <div className="cap-stable-audio-duration-fields"><label>{t("explore.minimumSeconds")}<input type="number" min="0" max="604800" value={minimumSeconds} onChange={(event) => setMinimumSeconds(event.target.value)} /></label><label>{t("explore.maximumSeconds")}<input type="number" min="1" max="604800" value={maximumSeconds} onChange={(event) => setMaximumSeconds(event.target.value)} /></label></div>
      <div className="cap-stable-flyout-actions"><button type="button" onClick={() => { onSearchOptionsChange({ ...search, audioDurationPreset: undefined, audioDurationRange: undefined }); setAnchor(null); }}>{t("explore.clearFilters")}</button><button type="button" className="is-selected" disabled={!durationRange} onClick={() => { if (!durationRange) return; onSearchOptionsChange({ ...search, audioDurationPreset: undefined, audioDurationRange: durationRange }); setAnchor(null); }}>{t("common.confirm")}</button></div>
    </StableSidebarFlyout>}
  </>;
};

export default StableAudioFilters;
