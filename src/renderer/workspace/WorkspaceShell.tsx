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
import "../stable-ui/StableMainShell.css";
import "./WorkspaceShell.css";

export default function WorkspaceShell({ resultsToolbar, resultContent, sidebar, skim, interactionLocked }: { resultsToolbar: ReactNode; resultContent: (active: boolean) => ReactNode; sidebar: StableSidebarProps; skim: StableSkimProps; interactionLocked: boolean }) {
  const [directoriesOpen, setDirectoriesOpen] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const navigation = useWorkspaceDirectoryNavigation(sidebar, skim);
  const { skimOpen } = navigation;
  const resultsKeyboardActive = !skimOpen, skimKeyboardActive = skimOpen;
  const shellRef = useInertElement<HTMLElement>(interactionLocked);
  return <section ref={shellRef} className={`cap-stable-main-shell cap-workspace-shell${skimOpen ? " is-skim-open" : ""}${filtersVisible ? "" : " is-filters-hidden"}`}>
    <WorkspaceRail skimOpen={skimOpen} directoriesOpen={directoriesOpen} filtersVisible={filtersVisible} onSkim={() => { setDirectoriesOpen(false); navigation.openSkim(); }} onDirectories={() => setDirectoriesOpen((open) => !open)} onFilters={() => { setDirectoriesOpen(false); setFiltersVisible((visible) => !visible); }} onSettings={sidebar.onOpenSettings} />
    <header className="cap-workspace-header">
      <WorkspaceTabBar tabs={navigation.tabs} activeId={navigation.activeId} onSelect={navigation.select} onClose={navigation.close} />
      {!skimOpen && <button className="cap-workspace-ai" type="button" title={t("stableUi.sidebar.aiEnhance")} aria-label={t("stableUi.sidebar.aiEnhance")} aria-pressed={sidebar.aiSearchEnabled} onClick={sidebar.onAiSearchToggle}><StableUiIcon name="ai" active={sidebar.aiSearchEnabled} /></button>}
    </header>
    <section id="workspace-results" className="cap-stable-results-slot" aria-label={t("stableUi.resultsRegion")}>{resultsToolbar}{resultContent(!interactionLocked && resultsKeyboardActive)}</section>
    {navigation.skimPresent && <StableSkimSlot {...skim} foreground={!interactionLocked && skimOpen} content={skim.renderContent(!interactionLocked && skimKeyboardActive)} onToggleSkim={() => navigation.close("skim")} />}
    {directoriesOpen && !interactionLocked && <WorkspaceDirectoryPicker sidebar={sidebar} onSelect={navigation.selectDirectory} onClose={() => setDirectoriesOpen(false)} />}
  </section>;
}
