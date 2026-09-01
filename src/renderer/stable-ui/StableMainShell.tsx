import type { ReactNode } from "react";
import StableShellSidebar from "./StableShellSidebar";
import StableSkimSlot from "./StableSkimSlot";
import type { StableSidebarProps } from "./stableSidebarTypes";
import type { StableSkimProps } from "./stableSkimTypes";
import { useStableShellLayout } from "./useStableShellLayout";
import "./StableMainShell.css";

const StableMainShell = ({ resultContent, sidebar, skim }: { resultContent: ReactNode; sidebar: StableSidebarProps; skim: StableSkimProps }) => {
  const { shellStyle, skimOpen, resizeSidebar, resizeSkim, resetSidebarWidth, resetSkimWidth, toggleSkim } = useStableShellLayout(skim.onOpen);

  return (
    <section className={`cap-stable-main-shell${skimOpen ? " is-skim-open" : ""}`} style={shellStyle}>
      <StableShellSidebar {...sidebar} skimOpen={skimOpen} onToggleSkim={toggleSkim} />
      <button className="cap-stable-resizer cap-stable-sidebar-resizer" type="button" aria-label="调整侧栏宽度"
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={resizeSidebar}
        onDoubleClick={resetSidebarWidth} />
      <section className="cap-stable-results-slot" aria-label="搜索结果区">{resultContent}</section>
      <button className="cap-stable-resizer cap-stable-skim-resizer" type="button" aria-label="调整 Skim 宽度"
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={resizeSkim}
        onDoubleClick={resetSkimWidth} />
      <StableSkimSlot {...skim} content={skim.renderContent(skimOpen)} />
    </section>
  );
};

export default StableMainShell;
