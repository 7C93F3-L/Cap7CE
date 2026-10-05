import { useLayoutEffect, useRef, useState } from "react";
import { t } from "../../../electron/localization";
import type { WorkspaceTabItem } from "../../shared/workspaceTypes";
import StableSidebarFlyout from "../stable-ui/StableSidebarFlyout";
import { getWorkspaceTabOverflow } from "./workspaceTabOverflow";

const TabTitle = ({ name }: { name: string }) => {
  const split = Math.max(1, name.length - Math.min(4, Math.floor(name.length / 2)));
  return <span className="cap-workspace-tab-name"><span className="cap-middle-ellipsis-leading">{name.slice(0, split)}</span><span className="cap-middle-ellipsis-trailing">{name.slice(split)}</span></span>;
};

export default function WorkspaceTabBar({ tabs, activeId, onSelect, onClose }: {
  tabs: WorkspaceTabItem[]; activeId: string; onSelect: (id: string) => void; onClose: (id: string) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    const element = barRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => { setWidth(element.clientWidth); setAnchor(null); });
    setWidth(element.clientWidth); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { visible, hidden } = getWorkspaceTabOverflow(tabs, activeId, width);
  return <div ref={barRef} className="cap-workspace-tabs" role="tablist" aria-label={t("workspace.tabs")}>
    {visible.map((tab) => <div className={`cap-workspace-tab${tab.id === activeId ? " is-active" : ""}`} key={tab.id}>
      <button type="button" role="tab" aria-selected={tab.id === activeId} aria-controls="workspace-results" title={tab.path ?? tab.name} onClick={() => onSelect(tab.id)}>
        <TabTitle name={tab.name} />
      </button>
      {tab.closable && <button type="button" className="cap-workspace-tab-close" aria-label={`${t("common.close")} ${tab.name}`} onClick={() => onClose(tab.id)}>×</button>}
    </div>)}
    {hidden.length > 0 && <button type="button" className="cap-workspace-more" aria-label={t("workspace.moreTabs")} aria-expanded={anchor !== null} onClick={(event) => setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect())}>···</button>}
    {anchor && hidden.length > 0 && <StableSidebarFlyout anchor={anchor} label={t("workspace.moreTabs")} placement="below" onClose={() => setAnchor(null)}>
      {hidden.map((tab) => <button type="button" key={tab.id} title={tab.path ?? tab.name} onClick={() => { onSelect(tab.id); setAnchor(null); }}>{tab.name}</button>)}
    </StableSidebarFlyout>}
  </div>;
}
