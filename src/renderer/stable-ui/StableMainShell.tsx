import type { ReactNode } from "react";
import { t } from "../../../electron/localization";
import StableShellSidebar from "./StableShellSidebar";
import StableSkimSlot from "./StableSkimSlot";
import type { StableSidebarProps } from "./stableSidebarTypes";
import type { StableSkimProps } from "./stableSkimTypes";
import { useStableShellLayout } from "./useStableShellLayout";
import "./StableMainShell.css";
const StableMainShell = ({ resultContent, sidebar, skim }: { resultContent: ReactNode; sidebar: StableSidebarProps; skim: StableSkimProps }) => {
  const { shellStyle, skimOpen, sidebarWidth, skimWidth, skimMaximumWidth, resizeSidebar, resizeSkim, resizeSidebarByKeyboard, resizeSkimByKeyboard, resetSidebarWidth, resetSkimWidth, toggleSkim } = useStableShellLayout(skim.onOpen, skim.toggleRequestId);

  return (
    <section className={`cap-stable-main-shell${skimOpen ? " is-skim-open" : ""}`} style={shellStyle}>
      <StableShellSidebar {...sidebar} skimOpen={skimOpen} onToggleSkim={toggleSkim} />
      <button className="cap-stable-resizer cap-stable-sidebar-resizer" type="button" role="separator" aria-orientation="vertical" aria-label={t("stableUi.resizeSidebar")} aria-valuemin={40} aria-valuemax={320} aria-valuenow={sidebarWidth}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={resizeSidebar}
        onKeyDown={resizeSidebarByKeyboard} onDoubleClick={resetSidebarWidth} />
      <section className="cap-stable-results-slot" aria-label={t("stableUi.resultsRegion")}>{resultContent}</section>
      <button className="cap-stable-resizer cap-stable-skim-resizer" type="button" role="separator" aria-orientation="vertical" aria-label={t("stableUi.resizeSkim")} aria-valuemin={280} aria-valuemax={skimMaximumWidth} aria-valuenow={skimWidth}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={resizeSkim}
        onKeyDown={resizeSkimByKeyboard} onDoubleClick={resetSkimWidth} />
      <StableSkimSlot {...skim} content={skim.renderContent(skimOpen)} />
    </section>
  );
};

export default StableMainShell;
