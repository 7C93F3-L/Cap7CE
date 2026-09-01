import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import StablePlaceholderGrid from "./StablePlaceholderGrid";
import StableShellSidebar from "./StableShellSidebar";
import StableSkimSlot from "./StableSkimSlot";
import "./StableMainShell.css";

const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);

const StableMainShell = () => {
  const [sidebarWidth, setSidebarWidth] = useState(160);
  const [skimWidth, setSkimWidth] = useState(360);
  const [skimOpen, setSkimOpen] = useState(true);
  const shellStyle = {
    "--cap-stable-sidebar-width": `${sidebarWidth}px`,
    "--cap-stable-skim-width": `${skimWidth}px`
  } as CSSProperties;

  const resizeSidebar = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setSidebarWidth(clamp(event.clientX, 40, 320));
  };
  const resizeSkim = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setSkimWidth(clamp(window.innerWidth - event.clientX, 280, 480));
  };

  return (
    <section className={`cap-stable-main-shell${skimOpen ? " is-skim-open" : ""}`} style={shellStyle}>
      <StableShellSidebar skimOpen={skimOpen} onToggleSkim={() => setSkimOpen((open) => !open)} />
      <button className="cap-stable-resizer cap-stable-sidebar-resizer" type="button" aria-label="调整侧栏宽度"
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={resizeSidebar}
        onDoubleClick={() => setSidebarWidth(160)} />
      <main className="cap-stable-results-slot" aria-label="搜索结果布局占位区">
        <StablePlaceholderGrid kind="results" count={30} />
      </main>
      <button className="cap-stable-resizer cap-stable-skim-resizer" type="button" aria-label="调整 Skim 宽度"
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={resizeSkim}
        onDoubleClick={() => setSkimWidth(360)} />
      <StableSkimSlot />
    </section>
  );
};

export default StableMainShell;
