import { t } from "../../../electron/localization";
import StableUiIcon from "../stable-ui/StableUiIcon";

export default function WorkspaceRail({ skimOpen, directoriesOpen, filtersVisible, filterCount, onSkim, onDirectories, onFilters, onSettings }: {
  skimOpen: boolean; directoriesOpen: boolean; filtersVisible: boolean; filterCount: number; onSkim: () => void; onDirectories: () => void; onFilters: () => void; onSettings: () => void;
}) {
  return <nav className="cap-workspace-rail" aria-label={t("workspace.navigation")}>
    <button type="button" aria-label={t("skim.name")} title={t("skim.name")} aria-pressed={skimOpen} onClick={onSkim}><StableUiIcon name="skim" active={skimOpen} /></button>
    <button type="button" aria-label={t("stableUi.sidebar.addedDirectories")} title={t("stableUi.sidebar.addedDirectories")} aria-expanded={directoriesOpen} onClick={onDirectories}><StableUiIcon name="folder" active={directoriesOpen} /></button>
    {<button type="button" aria-label={t("workspace.filters")} title={t("workspace.filters")} aria-pressed={filtersVisible} onClick={onFilters}><StableUiIcon name="scope" active={filtersVisible} />{filterCount > 0 && <span className="cap-workspace-filter-badge">{filterCount}</span>}</button>}
    <button type="button" className="cap-workspace-settings" aria-label={t("window.openSettings")} title={t("window.openSettings")} onClick={onSettings}><StableUiIcon name="settings" /></button>
  </nav>;
}
