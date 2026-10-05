import { useEffect, useState, type ReactNode } from "react";
import { t } from "../../../electron/localization";
import StableSidebarFlyout from "../stable-ui/StableSidebarFlyout";
import "./WorkspaceToolbarTools.css";

export default function WorkspaceToolbarTools({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 650px), (max-height: 359.98px)").matches);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 650px), (max-height: 359.98px)");
    const update = () => { setCompact(media.matches); setAnchor(null); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  if (!compact) return <div className="cap-workspace-toolbar-tools">{children}</div>;
  return <>
    <button className="cap-workspace-tools-trigger" type="button" title={t("workspace.tools")} aria-label={t("workspace.tools")} aria-expanded={anchor !== null} onClick={(event) => setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect())}>···</button>
    {anchor && <StableSidebarFlyout anchor={anchor} label={t("workspace.tools")} placement="below" width={260} maximumHeight={300} className="cap-workspace-tools-flyout" onClose={() => setAnchor(null)}>{children}</StableSidebarFlyout>}
  </>;
}
