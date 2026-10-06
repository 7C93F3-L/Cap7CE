import { useRef } from "react";
import { t } from "../../../electron/localization";
import type { SearchState } from "../../shared/types";
import type { SearchFilterDetailDomain } from "../../shared/searchFilterTypes";
import CustomScrollbar from "../CustomScrollbar";
import StableExploreFilters from "../stable-ui/StableExploreFilters";
import "./WorkspaceFilterPanel.css";

export default function WorkspaceFilterPanel({ search, availableFormats, detailDomains, count, onChange, onClear, onClose }: {
  search: SearchState; availableFormats: string[]; count: number;
  onChange: (search: SearchState) => void; onClear: () => void; onClose: () => void;
  detailDomains?: readonly SearchFilterDetailDomain[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return <aside className="cap-workspace-filter-panel" aria-label={t("workspace.filters")}>
    <header><strong>{t("workspace.filters")}</strong><span>{t("workspace.activeFilters", { count })}</span><button type="button" aria-label={t("common.close")} title={t("common.close")} onClick={onClose}>×</button></header>
    <div className="cap-workspace-filter-scroll-frame">
      <div ref={scrollRef} className="cap-workspace-filter-scroll"><StableExploreFilters search={search} availableFormats={availableFormats} detailDomains={detailDomains} closeFlyoutRequest={0} onFlyoutOpen={() => {}} onSearchOptionsChange={onChange} /></div>
      <CustomScrollbar scrollContainerRef={scrollRef} orientation="vertical" />
    </div>
    <footer><button type="button" disabled={!count} onClick={onClear}>{t("explore.clearFilters")}</button></footer>
  </aside>;
}
