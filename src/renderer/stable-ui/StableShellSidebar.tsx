import { useState, type MouseEvent } from "react";
import { t } from "../../../electron/localization";
import type { DirectoryItem, SkimDisplayMode, SortDirection, SortField } from "../../shared/types";
import settingsIcon from "../assets/icons/icon-settings.svg";
import skimIcon from "../assets/icons/icon-skim.svg";
import StableSidebarFlyout from "./StableSidebarFlyout";
import StableSidebarIcon from "./StableSidebarIcons";
import type { StableSidebarProps } from "./stableSidebarTypes";
import "./StableSidebar.css";

type FlyoutState = { kind: "sort" | "scope"; anchor: DOMRect } | { kind: "directory"; anchor: DOMRect; directory: DirectoryItem } | null;
interface StableShellSidebarProps extends StableSidebarProps { skimOpen: boolean; onToggleSkim: () => void; }

const StableShellSidebar = ({ search, directories, skimDisplayMode, aiSearchEnabled, aiSearchBusy, isLoadingDirectories, isAddingDirectory, directoryServiceUnavailable, editingDirectoryId, onAiSearchToggle, onSearchOptionsChange, onSearchDisplayModeChange, onAddDirectory, onEditDirectory, onCancelDirectoryEdit, onDirectoryNameChange, onDeleteDirectory, onOpenSettings, skimOpen, onToggleSkim }: StableShellSidebarProps) => {
  const [flyout, setFlyout] = useState<FlyoutState>(null);
  const allDirectories = directories[0];
  const addedDirectories = directories.slice(1);
  const sortValue = `${search.sortField === "modified_at" ? t("sort.field.modifiedAt") : t("sort.field.name")} · ${search.sortDirection === "desc" ? t("sort.direction.desc") : t("sort.direction.asc")}`;
  const scopeValue = skimDisplayMode === "all" ? t("stableUi.sidebar.scopeAll") : skimDisplayMode === "custom" ? t("stableUi.sidebar.scopeCustom") : t("stableUi.sidebar.scopeDefault");
  const aiValue = aiSearchBusy ? t("search.section.aiMatching.title") : aiSearchEnabled ? t("common.enabled") : t("search.section.aiPaused.title");
  const openFlyout = (kind: "sort" | "scope", event: MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); setFlyout({ kind, anchor: event.currentTarget.getBoundingClientRect() }); };
  const openDirectoryFlyout = (directory: DirectoryItem, event: MouseEvent<HTMLElement>) => { event.preventDefault(); event.stopPropagation(); setFlyout({ kind: "directory", anchor: event.currentTarget.getBoundingClientRect(), directory }); };
  const selectSortField = (sortField: SortField) => onSearchOptionsChange({ ...search, sortField });
  const selectSortDirection = (sortDirection: SortDirection) => onSearchOptionsChange({ ...search, sortDirection });
  const selectDirectory = (directoryId: string) => onSearchOptionsChange({ ...search, directoryId });
  const closeFlyout = () => setFlyout(null);

  const renderDirectory = (directory: DirectoryItem, all = false) => {
    const selected = search.directoryId === directory.id;
    const count = directory.fileCount ?? "…";
    const title = all ? t("stableUi.sidebar.allDirectories") : `${directory.path}\n${t("settings.directoryFileCountHint")}：${count}`;
    if (!all && editingDirectoryId === directory.id) {
      return <div className="cap-stable-directory-item is-editing" key={directory.id}>
        <StableSidebarIcon name="folder" />
        <input autoFocus defaultValue={directory.name} aria-label={t("settings.renameDirectoryHint")} onBlur={(event) => {
          if (event.currentTarget.dataset.cancelled !== "true") onDirectoryNameChange(directory.id, event.currentTarget.value);
        }} onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.currentTarget.dataset.cancelled = "true"; onCancelDirectoryEdit(); }
          if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
        }} />
      </div>;
    }
    const directoryButton = <button className={`cap-stable-directory-item${selected ? " is-selected" : ""}`} type="button" title={title} aria-pressed={selected}
      onClick={() => selectDirectory(directory.id)} onDoubleClick={() => { if (!all) onEditDirectory(directory.id); }}>
      <StableSidebarIcon name="folder" />
      <span className="cap-stable-directory-label">{all ? t("stableUi.sidebar.allDirectories") : directory.name}</span>
      {!all && <span className="cap-stable-directory-count">{count}</span>}
    </button>;
    if (all) return <div key={directory.id}>{directoryButton}</div>;
    return <div className="cap-stable-directory-row" key={directory.id} onContextMenu={(event) => openDirectoryFlyout(directory, event)}>
      {directoryButton}
      <button className="cap-stable-directory-more" type="button" aria-label={t("common.manage")} onClick={(event) => openDirectoryFlyout(directory, event)}><StableSidebarIcon name="more" /></button>
    </div>;
  };

  return <aside className="cap-stable-sidebar">
    <div className="cap-stable-brand" aria-label="Cap7CE">Cap7CE</div>
    <div className="cap-stable-sidebar-controls">
      <button className="cap-stable-sidebar-control" type="button" title={t("stableUi.sidebar.aiEnhance")} aria-pressed={aiSearchEnabled} onClick={onAiSearchToggle}>
        <StableSidebarIcon name="ai" /><span className="cap-stable-control-copy"><strong>{t("stableUi.sidebar.aiEnhance")}</strong><small>{aiValue}</small></span><span className={`cap-stable-switch${aiSearchEnabled ? " is-active" : ""}`} aria-hidden="true" />
      </button>
      <button className="cap-stable-sidebar-control" type="button" title={t("sort.parent")} aria-expanded={flyout?.kind === "sort"} onClick={(event) => openFlyout("sort", event)}>
        <StableSidebarIcon name="sort" /><span className="cap-stable-control-copy"><strong>{t("sort.parent")}</strong><small>{sortValue}</small></span><span className="cap-stable-control-chevron">›</span>
      </button>
      <button className="cap-stable-sidebar-control" type="button" title={t("stableUi.sidebar.searchScope")} aria-expanded={flyout?.kind === "scope"} onClick={(event) => openFlyout("scope", event)}>
        <StableSidebarIcon name="scope" /><span className="cap-stable-control-copy"><strong>{t("stableUi.sidebar.searchScope")}</strong><small>{scopeValue}</small></span><span className="cap-stable-control-chevron">›</span>
      </button>
    </div>

    <section className="cap-stable-directory-section">
      <div className="cap-stable-directory-heading"><span>{t("stableUi.sidebar.addedDirectories")}</span><button type="button" title={t("settings.addDirectoryActionHint")} aria-label={t("settings.addDirectoryActionHint")} disabled={isAddingDirectory} onClick={onAddDirectory}><StableSidebarIcon name="add" /></button></div>
      {allDirectories && renderDirectory(allDirectories, true)}
      <div className="cap-stable-directory-list">
        {isLoadingDirectories && <span className="cap-stable-directory-message">{t("settings.directoryLoading")}</span>}
        {!isLoadingDirectories && directoryServiceUnavailable && <span className="cap-stable-directory-message">{t("common.unavailable")}</span>}
        {!isLoadingDirectories && !directoryServiceUnavailable && addedDirectories.length === 0 && <span className="cap-stable-directory-message">{t("settings.directoryEmpty")}</span>}
        {!isLoadingDirectories && !directoryServiceUnavailable && addedDirectories.map((directory) => renderDirectory(directory))}
      </div>
    </section>

    <div className="cap-stable-sidebar-footer">
      <button className={skimOpen ? "is-active" : ""} type="button" title={skimOpen ? t("skim.exit") : t("skim.open")} aria-label={skimOpen ? t("skim.exit") : t("skim.open")} aria-pressed={skimOpen} onClick={onToggleSkim}><img src={skimIcon} alt="" /></button>
      <button type="button" title={t("window.openSettings")} aria-label={t("window.openSettings")} onClick={onOpenSettings}><img src={settingsIcon} alt="" /></button>
    </div>

    {flyout?.kind === "sort" && <StableSidebarFlyout anchor={flyout.anchor} label={t("sort.parent")} onClose={closeFlyout}>
      <span className="cap-stable-flyout-title">{t("sort.parent")}</span>
      {(["modified_at", "file_name"] as SortField[]).map((field) => <button type="button" className={search.sortField === field ? "is-selected" : ""} key={field} onClick={() => { selectSortField(field); closeFlyout(); }}>{field === "modified_at" ? t("sort.field.modifiedAt") : t("sort.field.name")}</button>)}
      {(["desc", "asc"] as SortDirection[]).map((direction) => <button type="button" className={search.sortDirection === direction ? "is-selected" : ""} key={direction} onClick={() => { selectSortDirection(direction); closeFlyout(); }}>{direction === "desc" ? t("sort.direction.desc") : t("sort.direction.asc")}</button>)}
    </StableSidebarFlyout>}
    {flyout?.kind === "scope" && <StableSidebarFlyout anchor={flyout.anchor} label={t("stableUi.sidebar.searchScope")} onClose={closeFlyout}>
      {(["skim", "all", "custom"] as SkimDisplayMode[]).map((mode) => <button type="button" className={skimDisplayMode === mode ? "is-selected" : ""} key={mode} onClick={() => { onSearchDisplayModeChange(mode); closeFlyout(); }}>{mode === "all" ? t("stableUi.sidebar.scopeAll") : mode === "custom" ? t("stableUi.sidebar.scopeCustom") : t("stableUi.sidebar.scopeDefault")}</button>)}
    </StableSidebarFlyout>}
    {flyout?.kind === "directory" && <StableSidebarFlyout anchor={flyout.anchor} label={flyout.directory.name} onClose={closeFlyout}>
      <button type="button" onClick={() => { onEditDirectory(flyout.directory.id); closeFlyout(); }}>{t("settings.renameDirectoryHint")}</button>
      <button type="button" className="is-danger" onClick={() => { onDeleteDirectory(flyout.directory.id); closeFlyout(); }}>{t("common.delete")}</button>
    </StableSidebarFlyout>}
  </aside>;
};

export default StableShellSidebar;
