import { createPortal } from "react-dom";
import { t } from "../../../electron/localization";
import type { DirectoryItem } from "../../shared/types";

interface StableDirectoryTooltipProps { anchor: DOMRect; directory: DirectoryItem; all: boolean; directoryCount: number; }

const StableDirectoryTooltip = ({ anchor, directory, all, directoryCount }: StableDirectoryTooltipProps) => {
  const left = anchor.right + 5;
  const width = Math.max(0, Math.min(184, window.innerWidth - left - 5));
  const top = Math.max(5, Math.min(anchor.top, window.innerHeight - 120));
  const portalHost = document.querySelector<HTMLElement>(".cap-stable-ui") ?? document.body;
  const pathTailLength = directory.path.length > 28 ? Math.min(18, Math.floor(directory.path.length * .4)) : 0;
  const pathLeading = pathTailLength > 0 ? directory.path.slice(0, -pathTailLength) : directory.path;
  const pathTrailing = pathTailLength > 0 ? directory.path.slice(-pathTailLength) : "";
  return createPortal(
    <div className="cap-stable-directory-tooltip" role="tooltip" style={{ left, top, width }}>
      <strong className="cap-stable-directory-tooltip-title">{all ? t("stableUi.sidebar.allDirectories") : directory.name}</strong>
      <small className="cap-stable-directory-tooltip-count">{t("search.fileCount", { count: directory.fileCount ?? "…" })}</small>
      {all
        ? <span className="cap-stable-directory-tooltip-summary">{t("stableUi.sidebar.addedDirectories")}：{directoryCount}</span>
        : <span className="cap-stable-directory-tooltip-path" aria-label={directory.path}><span>{pathLeading}</span>{pathTrailing && <span>{pathTrailing}</span>}</span>}
    </div>,
    portalHost
  );
};

export default StableDirectoryTooltip;
