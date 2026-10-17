import { useState, type MouseEvent } from "react";
import {
  gibibyte,
  kibibyte,
  mebibyte,
  normalizeFileSizeRange,
  searchFileSizePresets,
  type SearchFileSizeRange
} from "../../../electron/fileSizeSearchFilters";
import { t, type TranslationKey } from "../../../electron/localization";
import type { SearchState } from "../../shared/types";
import StableFilterEditGlyph from "./StableFilterEditGlyph";
import StableSidebarFlyout from "./StableSidebarFlyout";
import "./StableFileSizeFilter.css";

type SizeUnit = "KB" | "MB" | "GB";
type SizeDraft = { value: string; unit: SizeUnit };
const unitBytes: Record<SizeUnit, number> = { KB: kibibyte, MB: mebibyte, GB: gibibyte };
const presetLabels: Record<(typeof searchFileSizePresets)[number], TranslationKey> = {
  "under-1mb": "explore.fileSize.underOneMb",
  "1mb-10mb": "explore.fileSize.oneToTenMb",
  "10mb-100mb": "explore.fileSize.tenToHundredMb",
  "100mb-1gb": "explore.fileSize.hundredMbToOneGb",
  "1gb-or-more": "explore.fileSize.oneGbOrMore"
};
const emptyDraft = (): SizeDraft => ({ value: "", unit: "MB" });
const toDraft = (bytes?: number): SizeDraft => {
  if (bytes === undefined) return emptyDraft();
  const unit: SizeUnit = bytes >= gibibyte ? "GB" : bytes >= mebibyte ? "MB" : "KB";
  return { value: String(Number((bytes / unitBytes[unit]).toFixed(3))), unit };
};
const toBytes = (draft: SizeDraft) => {
  if (!draft.value.trim()) return undefined;
  const value = Number(draft.value);
  if (!Number.isFinite(value) || value < 0) return Number.NaN;
  return Math.round(value * unitBytes[draft.unit]);
};
const toRange = (minimum: SizeDraft, maximum: SizeDraft): SearchFileSizeRange | null => normalizeFileSizeRange({ minBytes: toBytes(minimum), maxBytes: toBytes(maximum) });
const formatBoundary = (bytes: number) => {
  const unit = (["GB", "MB", "KB"] as const).find(unit => bytes >= unitBytes[unit] && bytes % unitBytes[unit] === 0);
  return `${(unit ? bytes / unitBytes[unit] : bytes).toLocaleString()} ${unit ?? "B"}`;
};

const StableFileSizeFilter = ({ search, onFlyoutOpen, onSearchOptionsChange }: { search: SearchState; onFlyoutOpen: () => void; onSearchOptionsChange: (search: SearchState) => void }) => {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [minimum, setMinimum] = useState<SizeDraft>(() => toDraft(search.fileSizeRange?.minBytes));
  const [maximum, setMaximum] = useState<SizeDraft>(() => toDraft(search.fileSizeRange?.maxBytes));
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onFlyoutOpen();
    setMinimum(toDraft(search.fileSizeRange?.minBytes));
    setMaximum(toDraft(search.fileSizeRange?.maxBytes));
    setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect());
  };
  const range = toRange(minimum, maximum);
  const selectedRange = normalizeFileSizeRange(search.fileSizeRange);
  const rangeLabel = !selectedRange ? "" : selectedRange.minBytes !== undefined && selectedRange.maxBytes !== undefined
    ? `${formatBoundary(selectedRange.minBytes)} – ${formatBoundary(selectedRange.maxBytes)}`
    : selectedRange.minBytes !== undefined ? `≥ ${formatBoundary(selectedRange.minBytes)}` : `≤ ${formatBoundary(selectedRange.maxBytes!)}`;
  const update = (setter: (value: SizeDraft) => void, draft: SizeDraft, key: keyof SizeDraft, value: string) => setter({ ...draft, [key]: value });
  return <section className="cap-stable-file-size-filter">
    <header><strong>{t("explore.fileSize")}</strong><button type="button" title={t("explore.editFileSize")} aria-label={t("explore.editFileSize")} aria-expanded={anchor !== null} onPointerDown={(event) => event.stopPropagation()} onClick={open}><StableFilterEditGlyph /></button>{rangeLabel && <span title={rangeLabel}>{t("explore.fileSize.customShort")}</span>}</header>
    <div className="cap-stable-file-size-options">{[searchFileSizePresets.slice(0, 3), searchFileSizePresets.slice(3)].map((row, index) => <div className="cap-stable-file-size-row" key={index}>{row.map((preset) => <button type="button" className={search.fileSizePreset === preset ? "is-selected" : ""} aria-pressed={search.fileSizePreset === preset} key={preset} onClick={() => onSearchOptionsChange({ ...search, fileSizePreset: search.fileSizePreset === preset ? undefined : preset, fileSizeRange: undefined })}>{t(presetLabels[preset])}</button>)}</div>)}</div>
    {anchor && <StableSidebarFlyout anchor={anchor} label={t("explore.editFileSize")} placement="below" align="start" width={360} maximumHeight={240} className="cap-stable-explore-flyout cap-stable-file-size-flyout" onClose={() => setAnchor(null)}>
      <div className="cap-stable-file-size-fields">{([[t("explore.minimumFileSize"), minimum, setMinimum], [t("explore.maximumFileSize"), maximum, setMaximum]] as const).map(([label, draft, setter]) => <label key={label}>{label}<span><input type="number" min="0" step="any" value={draft.value} onChange={(event) => update(setter, draft, "value", event.target.value)} /><select value={draft.unit} onChange={(event) => update(setter, draft, "unit", event.target.value)}>{(["KB", "MB", "GB"] as const).map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></span></label>)}</div>
      <div className="cap-stable-flyout-actions"><button type="button" onClick={() => { onSearchOptionsChange({ ...search, fileSizePreset: undefined, fileSizeRange: undefined }); setAnchor(null); }}>{t("explore.clearFilters")}</button><button type="button" className="is-selected" disabled={!range} onClick={() => { if (!range) return; onSearchOptionsChange({ ...search, fileSizePreset: undefined, fileSizeRange: range }); setAnchor(null); }}>{t("common.confirm")}</button></div>
    </StableSidebarFlyout>}
  </section>;
};

export default StableFileSizeFilter;
