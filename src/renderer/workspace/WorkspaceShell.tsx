import type { SearchState } from "../../shared/types";
import WorkspaceFilterPanel from "./WorkspaceFilterPanel";
import { workspaceFilterCount } from "./workspaceFilterSummary";
import type { WorkspaceSearchBridge } from "../../shared/workspaceTypes";
import { useWorkspaceOverlayDismiss } from "./useWorkspaceOverlayDismiss";
import { useState, type ReactNode } from "react";
import { t } from "../../../electron/localization";
import StableSkimSlot from "../stable-ui/StableSkimSlot";
import StableUiIcon from "../stable-ui/StableUiIcon";
import type { StableSidebarProps } from "../stable-ui/stableSidebarTypes";
import type { StableSkimProps } from "../stable-ui/stableSkimTypes";
import { useInertElement } from "../stable-ui/useInertElement";
import { useWorkspaceDirectoryNavigation } from "./useWorkspaceDirectoryNavigation";
import WorkspaceTabBar from "./WorkspaceTabBar";
import WorkspaceRail from "./WorkspaceRail";
import WorkspaceDirectoryPicker from "./WorkspaceDirectoryPicker";
import "./WorkspaceShell.css";
import { useComputerSearchFilters } from "../computer-search/useComputerSearchFilters";

export default function WorkspaceShell({ resultsToolbar, resultContent, sidebar, skim, workspace, filters, interactionLocked }: { resultsToolbar: ReactNode; resultContent: (active: boolean) => ReactNode; sidebar: StableSidebarProps; skim: StableSkimProps; workspace: WorkspaceSearchBridge; filters: { search: SearchState; availableFormats: string[]; onChange: (search: SearchState) => void; onClear: () => void }; interactionLocked: boolean }) {
  const [directoriesOpen, setDirectoriesOpen] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(() => window.innerWidth >= 1100 && window.innerHeight >= 360);
  const navigation = useWorkspaceDirectoryNavigation(sidebar, skim, workspace);
  const { skimOpen } = navigation;
  const coreFilters = useComputerSearchFilters(navigation.skimPresent);
  const activeFilters = skimOpen ? coreFilters.panel : filters;
  const filterCount = workspaceFilterCount(activeFilters.search);
  useWorkspaceOverlayDismiss(directoriesOpen, filtersVisible && !interactionLocked, Boolean(sidebar.editingDirectoryId), () => setDirectoriesOpen(false), () => setFiltersVisible(false));
  const resultsKeyboardActive = !skimOpen, skimKeyboardActive = skimOpen;
  const shellRef = useInertElement<HTMLElement>(interactionLocked);
  return <section ref={shellRef} className={`cap-stable-main-shell cap-workspace-shell${skimOpen ? " is-skim-open" : ""}${filtersVisible ? " has-filter-panel" : ""}`}>
    <WorkspaceRail skimOpen={skimOpen} directoriesOpen={directoriesOpen} filtersVisible={filtersVisible} filterCount={filterCount} onSkim={() => { setDirectoriesOpen(false); navigation.openSkim(); }} onDirectories={() => setDirectoriesOpen((open) => !open)} onFilters={() => { setDirectoriesOpen(false); setFiltersVisible((visible) => !visible); }} onSettings={sidebar.onOpenSettings} />
    <header className="cap-workspace-header">
      <WorkspaceTabBar tabs={navigation.tabs} activeId={navigation.activeId} onSelect={navigation.select} onClose={navigation.close} />
      {!skimOpen && <button className="cap-workspace-ai" type="button" title={t("stableUi.sidebar.aiEnhance")} aria-label={t("stableUi.sidebar.aiEnhance")} aria-pressed={sidebar.aiSearchEnabled} onClick={sidebar.onAiSearchToggle}><StableUiIcon name="ai" active={sidebar.aiSearchEnabled} /></button>}
    </header>
    <section id="workspace-results" className="cap-stable-results-slot" aria-label={t("stableUi.resultsRegion")}>{!skimOpen && resultsToolbar}{resultContent(!interactionLocked && resultsKeyboardActive)}</section>
    {navigation.skimPresent && <StableSkimSlot {...skim} conditions={coreFilters.conditions} invalidFilters={coreFilters.invalid} onSearchExit={coreFilters.clear} foreground={!interactionLocked && skimOpen} content={skim.renderContent(!interactionLocked && skimKeyboardActive)} onToggleSkim={() => navigation.close("skim")} />}
    {filtersVisible && <WorkspaceFilterPanel key={skimOpen ? "core" : workspace.viewKey} {...activeFilters} count={filterCount} onClose={() => setFiltersVisible(false)} />}
    {directoriesOpen && !interactionLocked && <WorkspaceDirectoryPicker sidebar={sidebar} onSelect={navigation.selectDirectory} onClose={() => setDirectoriesOpen(false)} />}
  </section>;
}
