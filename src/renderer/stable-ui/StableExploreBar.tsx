import { useState, type MouseEvent, type Ref } from "react";
import { t } from "../../../electron/localization";
import type { SearchState, SkimDisplayMode, SortDirection, SortField } from "../../shared/types";
import WorkspaceToolbarTools from "../workspace/WorkspaceToolbarTools";
import StableSearchInput from "./StableSearchInput";
import StableSidebarFlyout from "./StableSidebarFlyout";
import StableUiIcon from "./StableUiIcon";
import type { StableExploreProps } from "./stableExploreTypes";
import { hasExploreTypeFilters } from "./exploreTypeFilterState";
import { hasFileSizeFilter } from "./fileSizeFilterState";
import "./StableExploreBar.css";
import "./StableExploreCommands.css";
type ExploreFlyout = { kind: "scope" | "sort"; anchor: DOMRect } | null;

interface StableExploreBarProps extends StableExploreProps {
  search: SearchState;
  searchInputRef: Ref<HTMLInputElement>;
  inputFeedback: string;
  onSearchChange: (search: SearchState) => void;
  onSearchOptionsChange: (search: SearchState) => void;
  onSearch: (search: SearchState) => void;
}

const sortOptions: Array<{ field: SortField; direction: SortDirection }> = [
  { field: "modified_at", direction: "desc" },
  { field: "modified_at", direction: "asc" },
  { field: "file_name", direction: "asc" },
  { field: "file_name", direction: "desc" }
];

const StableExploreBar = ({ search, searchInputRef, inputFeedback, searchDisplayMode, randomBrowseEnabled, randomBatchNumber, randomBrowseBusy, onSearchChange, onSearchOptionsChange, onSearch, onSearchDisplayModeChange, onToggleRandomBrowse, onDisableRandomBrowse, onNextRandomBatch, onClearExploreFilters }: StableExploreBarProps) => {
  const [flyout, setFlyout] = useState<ExploreFlyout>(null);
  const scopeValue = searchDisplayMode === "all" ? t("stableUi.sidebar.scopeAll") : searchDisplayMode === "custom" ? t("stableUi.sidebar.scopeCustom") : t("stableUi.sidebar.scopeDefault");
  const sortValue = `${search.sortField === "modified_at" ? t("sort.field.modifiedAt") : t("sort.field.name")} · ${search.sortDirection === "desc" ? t("sort.direction.desc") : t("sort.direction.asc")}`;
  const hasActiveFilters = search.fileFormat !== "all" || Boolean(search.selectedExtensions?.length || (search.timePreset ?? "all") !== "all" || hasFileSizeFilter(search) || hasExploreTypeFilters(search));
  const closeFlyout = () => setFlyout(null);
  const openFlyout = (kind: "scope" | "sort", event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const anchor = event.currentTarget.getBoundingClientRect();
    setFlyout((current) => current?.kind === kind ? null : { kind, anchor });
  };

  return <section className="cap-stable-explore-bar" aria-label="搜索与素材筛选">
    <div className="cap-stable-explore-primary">
      <StableSearchInput search={search} inputRef={searchInputRef} inputFeedback={inputFeedback} onSearchChange={onSearchChange} onSearchOptionsChange={onSearchOptionsChange} onSearch={onSearch} />
      <WorkspaceToolbarTools><div className="cap-stable-explore-actions">
        <button className={flyout?.kind === "scope" ? "is-open" : ""} type="button" title={t("stableUi.sidebar.searchScope")} aria-expanded={flyout?.kind === "scope"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => openFlyout("scope", event)}>
          <StableUiIcon name="scope" className="cap-stable-explore-action-icon" />
          <span>{scopeValue}</span>
        </button>
        <button className={flyout?.kind === "sort" ? "is-open" : ""} type="button" title={t("sort.parent")} aria-expanded={flyout?.kind === "sort"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => openFlyout("sort", event)}>
          <StableUiIcon name="sort" sortDirection={search.sortDirection} className="cap-stable-explore-action-icon cap-stable-explore-sort-icon" />
          <span>{sortValue}</span>
        </button>
      </div>
      <div className="cap-stable-explore-commands">
        <button className={`cap-stable-explore-random${randomBrowseEnabled ? " is-active" : ""}`} type="button" role="switch" aria-checked={randomBrowseEnabled} disabled={randomBrowseBusy} onClick={onToggleRandomBrowse}><span>{t("explore.randomBrowse")}</span><i aria-hidden="true"><b /></i></button>
        <button type="button" disabled={!randomBrowseEnabled || randomBrowseBusy} onClick={onNextRandomBatch}>{t("explore.nextBatch")}{randomBrowseEnabled && <small>{randomBatchNumber}</small>}</button>
        <button type="button" disabled={(!hasActiveFilters && !randomBrowseEnabled) || randomBrowseBusy} onClick={onClearExploreFilters}>{t("explore.clearFilters")}</button>
      </div></WorkspaceToolbarTools>
    </div>
    {flyout?.kind === "scope" && <StableSidebarFlyout anchor={flyout.anchor} label={t("stableUi.sidebar.searchScope")} placement="below" onClose={closeFlyout}>
      {(["skim", "all", "custom"] as SkimDisplayMode[]).map((mode) => <button type="button" className={searchDisplayMode === mode ? "is-selected" : ""} key={mode} onClick={() => { if (mode !== searchDisplayMode) onSearchDisplayModeChange(mode); closeFlyout(); }}>{mode === "all" ? t("stableUi.sidebar.scopeAll") : mode === "custom" ? t("stableUi.sidebar.scopeCustom") : t("stableUi.sidebar.scopeDefault")}</button>)}
    </StableSidebarFlyout>}
    {flyout?.kind === "sort" && <StableSidebarFlyout anchor={flyout.anchor} label={t("sort.parent")} placement="below" onClose={closeFlyout}>
      {sortOptions.map(({ field, direction }) => <button type="button" className={search.sortField === field && search.sortDirection === direction ? "is-selected" : ""} key={`${field}-${direction}`} onClick={() => { if (randomBrowseEnabled) onDisableRandomBrowse(); if (field !== search.sortField || direction !== search.sortDirection) onSearchOptionsChange({ ...search, sortField: field, sortDirection: direction }); closeFlyout(); }}>{field === "modified_at" ? t("sort.field.modifiedAt") : t("sort.field.name")} · {direction === "desc" ? t("sort.direction.desc") : t("sort.direction.asc")}</button>)}
    </StableSidebarFlyout>}
  </section>;
};

export default StableExploreBar;
