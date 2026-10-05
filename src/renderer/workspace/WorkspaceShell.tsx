import { useState, type ReactNode } from "react";
import { t } from "../../../electron/localization";
import StableSkimSlot from "../stable-ui/StableSkimSlot";
import StableUiIcon from "../stable-ui/StableUiIcon";
import type { StableSidebarProps } from "../stable-ui/stableSidebarTypes";
import type { StableSkimProps } from "../stable-ui/stableSkimTypes";
import { useStableKeyboardRegion } from "../stable-ui/useStableKeyboardRegion";
import { useStableShellLayout } from "../stable-ui/useStableShellLayout";
import { useInertElement } from "../stable-ui/useInertElement";
import { useWorkspaceDirectoryNavigation } from "./useWorkspaceDirectoryNavigation";
import WorkspaceTabBar from "./WorkspaceTabBar";
import WorkspaceRail from "./WorkspaceRail";
import WorkspaceDirectoryPicker from "./WorkspaceDirectoryPicker";
import "../stable-ui/StableMainShell.css";
import "./WorkspaceShell.css";

export default function WorkspaceShell({ resultsToolbar, resultContent, sidebar, skim, interactionLocked }: { resultsToolbar: ReactNode; resultContent: (active: boolean) => ReactNode; sidebar: StableSidebarProps; skim: StableSkimProps; interactionLocked: boolean }) {
  const { shellStyle, skimOpen, skimWidth, skimMaximumWidth, resizeSkim, resizeSkimByKeyboard, resetSkimWidth, toggleSkim } = useStableShellLayout(skim.onOpen, skim.requests);
  const [resultsKeyboardActive, skimKeyboardActive, activateKeyboardRegion] = useStableKeyboardRegion(skimOpen);
  const [directoriesOpen, setDirectoriesOpen] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const navigation = useWorkspaceDirectoryNavigation(sidebar);
  const shellRef = useInertElement<HTMLElement>(interactionLocked);
  const selectDirectory = (id: string) => { if (skimOpen) toggleSkim(); navigation.selectDirectory(id); };
  return <section ref={shellRef} className={`cap-stable-main-shell cap-workspace-shell${skimOpen ? " is-skim-open" : ""}${filtersVisible ? "" : " is-filters-hidden"}`} style={shellStyle} onPointerDownCapture={activateKeyboardRegion} onFocusCapture={activateKeyboardRegion}>
    <WorkspaceRail skimOpen={skimOpen} directoriesOpen={directoriesOpen} filtersVisible={filtersVisible} onSkim={() => { setDirectoriesOpen(false); toggleSkim(); }} onDirectories={() => setDirectoriesOpen((open) => !open)} onFilters={() => { setDirectoriesOpen(false); if (skimOpen) toggleSkim(); setFiltersVisible((visible) => !visible); }} onSettings={sidebar.onOpenSettings} />
    <header className="cap-workspace-header">
      <WorkspaceTabBar tabs={navigation.tabs} activeId={navigation.activeId} onSelect={(id) => { if (skimOpen) toggleSkim(); navigation.select(id); }} onClose={navigation.close} />
      <button className="cap-workspace-ai" type="button" title={t("stableUi.sidebar.aiEnhance")} aria-label={t("stableUi.sidebar.aiEnhance")} aria-pressed={sidebar.aiSearchEnabled} onClick={sidebar.onAiSearchToggle}><StableUiIcon name="ai" active={sidebar.aiSearchEnabled} /></button>
    </header>
    <section id="workspace-results" className="cap-stable-results-slot" aria-label={t("stableUi.resultsRegion")}>{resultsToolbar}{resultContent(!interactionLocked && resultsKeyboardActive)}</section>
    <button className="cap-stable-resizer cap-stable-skim-resizer" type="button" role="separator" aria-orientation="vertical" aria-label={t("stableUi.resizeSkim")} aria-valuemin={280} aria-valuemax={skimMaximumWidth} aria-valuenow={skimWidth} onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={resizeSkim} onKeyDown={resizeSkimByKeyboard} onDoubleClick={resetSkimWidth} />
    <StableSkimSlot {...skim} content={skim.renderContent(!interactionLocked && skimKeyboardActive)} onToggleSkim={toggleSkim} />
    {directoriesOpen && !interactionLocked && <WorkspaceDirectoryPicker sidebar={sidebar} onSelect={selectDirectory} onClose={() => setDirectoriesOpen(false)} />}
  </section>;
}
