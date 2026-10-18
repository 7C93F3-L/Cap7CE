import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { t } from "../../../electron/localization";
import type { DirectoryItem } from "../../shared/types";
import CustomScrollbar from "../CustomScrollbar";
import StableDirectoryFlyout from "./StableDirectoryFlyout";
import StableDirectoryTooltip from "./StableDirectoryTooltip";
import StableSidebarIcon from "./StableSidebarIcons";
import StableUiIcon from "./StableUiIcon";
import type { StableSidebarProps } from "./stableSidebarTypes";
import "./StableSidebar.css";
type FlyoutState = { kind: "directory"; anchor: DOMRect; directory: DirectoryItem } | null;
type DirectoryTooltipState = { anchor: DOMRect; directoryId: string; all: boolean } | null;
interface StableShellSidebarProps extends StableSidebarProps { skimOpen: boolean; onToggleSkim: () => void; directoryOnly?: boolean; }
const StableShellSidebar = ({ search, directories, isLoadingDirectories, isAddingDirectory, directoryServiceUnavailable, editingDirectoryId, onSearchOptionsChange, onAddDirectory, onEditDirectory, onCancelDirectoryEdit, onDirectoryNameChange, onMoveDirectory, onOpenDirectory, onDeleteDirectory, onOpenSettings, skimOpen, onToggleSkim, directoryOnly = false }: StableShellSidebarProps) => {
  const [flyout, setFlyout] = useState<FlyoutState>(null);
  const [directoryTooltip, setDirectoryTooltip] = useState<DirectoryTooltipState>(null);
  const directoryTooltipTimerRef = useRef<number | null>(null);
  const directoryScrollRef = useRef<HTMLDivElement | null>(null);
  const allDirectories = directories[0];
  const addedDirectories = directories.slice(1);
  const hideDirectoryTooltip = () => { if (directoryTooltipTimerRef.current !== null) window.clearTimeout(directoryTooltipTimerRef.current); directoryTooltipTimerRef.current = null; setDirectoryTooltip(null); };
  const showDirectoryTooltipSoon = (directory: DirectoryItem, all: boolean, event: PointerEvent<HTMLElement>) => {
    hideDirectoryTooltip();
    if (flyout !== null || editingDirectoryId !== null) return;
    const anchor = event.currentTarget.getBoundingClientRect();
    directoryTooltipTimerRef.current = window.setTimeout(() => { directoryTooltipTimerRef.current = null; setDirectoryTooltip({ anchor, directoryId: directory.id, all }); }, 150);
  };
  useEffect(() => () => { if (directoryTooltipTimerRef.current !== null) window.clearTimeout(directoryTooltipTimerRef.current); }, []);
  const openDirectoryFlyout = (directory: DirectoryItem, event: MouseEvent<HTMLElement>) => { event.preventDefault(); event.stopPropagation(); hideDirectoryTooltip(); const anchor = event.currentTarget.closest<HTMLElement>(".cap-stable-directory-row") ?? event.currentTarget; setFlyout({ kind: "directory", anchor: anchor.getBoundingClientRect(), directory }); };
  const selectDirectory = (directoryId: string) => onSearchOptionsChange({ ...search, directoryId });
  const closeFlyout = () => setFlyout(null);
  const renderDirectory = (directory: DirectoryItem, all = false) => {
    const selected = search.directoryId === directory.id;
    const menuOpen = flyout?.kind === "directory" && flyout.directory.id === directory.id;
    const count = directory.fileCount ?? "…";
    const accessibleLabel = all ? t("stableUi.sidebar.allDirectories") : `${directory.name}; ${directory.path}; ${t("settings.directoryFileCountHint")}: ${count}`;
    if (!all && editingDirectoryId === directory.id) {
      return <div className="cap-stable-directory-item is-editing" key={directory.id}>
        <StableUiIcon name="folder" />
        <input autoFocus defaultValue={directory.name} aria-label={t("stableSettings.rename")} onBlur={(event) => {
          if (event.currentTarget.dataset.cancelled !== "true") onDirectoryNameChange(directory.id, event.currentTarget.value);
        }} onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.currentTarget.dataset.cancelled = "true"; onCancelDirectoryEdit(); }
          if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
        }} />
      </div>;
    }
    const directoryButton = <button className={`cap-stable-directory-item${selected ? " is-selected" : ""}`} type="button" aria-label={accessibleLabel} aria-pressed={selected}
      onClick={() => selectDirectory(directory.id)} onDoubleClick={() => { hideDirectoryTooltip(); if (!all) onEditDirectory(directory.id); }}>
      <StableUiIcon name="folder" active={selected} />
      <span className="cap-stable-directory-label">{all ? t("stableUi.sidebar.allDirectories") : directory.name}</span>
      {!all && <span className="cap-stable-directory-count">{count}</span>}
    </button>;
    if (all) return <div className="cap-stable-all-directories-row" key={directory.id} onPointerEnter={(event) => showDirectoryTooltipSoon(directory, true, event)} onPointerLeave={hideDirectoryTooltip} onPointerDown={hideDirectoryTooltip}>{directoryButton}</div>;
    return <div className={`cap-stable-directory-row${selected ? " is-selected" : ""}${menuOpen ? " is-menu-open" : ""}`} key={directory.id} onPointerEnter={(event) => showDirectoryTooltipSoon(directory, false, event)} onPointerLeave={hideDirectoryTooltip} onPointerDown={hideDirectoryTooltip} onContextMenu={(event) => openDirectoryFlyout(directory, event)}>
      {directoryButton}
      <button className="cap-stable-directory-more" type="button" aria-label={t("common.manage")} onClick={(event) => openDirectoryFlyout(directory, event)}><StableSidebarIcon name="more" /></button>
    </div>;
  };
  return <aside className={`cap-stable-sidebar${directoryOnly ? " is-directory-only" : ""}`}>
    <div className="cap-stable-brand" aria-label="Cap7CE"><span className="cap-stable-brand-logo" aria-hidden="true" /></div>

    <section className="cap-stable-directory-section">
      <div className="cap-stable-directory-heading"><span>{t("stableUi.sidebar.addedDirectories")}</span><button type="button" title={t("settings.addDirectoryActionHint")} aria-label={t("settings.addDirectoryActionHint")} disabled={isAddingDirectory} onClick={onAddDirectory}><StableSidebarIcon name="add" /></button></div>
      {allDirectories && renderDirectory(allDirectories, true)}
      <div className="cap-stable-directory-list-frame cap-scroll-viewport-frame cap-scroll-viewport-frame-vertical"><div ref={directoryScrollRef} className="cap-stable-directory-list cap-main-scroll-viewport" onScroll={hideDirectoryTooltip}>
        {isLoadingDirectories && <span className="cap-stable-directory-message">{t("settings.directoryLoading")}</span>}
        {!isLoadingDirectories && directoryServiceUnavailable && <span className="cap-stable-directory-message">{t("common.unavailable")}</span>}
        {!isLoadingDirectories && !directoryServiceUnavailable && addedDirectories.length === 0 && <span className="cap-stable-directory-message">{t("settings.directoryEmpty")}</span>}
        {!isLoadingDirectories && !directoryServiceUnavailable && addedDirectories.map((directory) => renderDirectory(directory))}
      </div><CustomScrollbar scrollContainerRef={directoryScrollRef} orientation="vertical" /></div>
    </section>
    <div className="cap-stable-sidebar-footer">
      <button className={skimOpen ? "is-active" : ""} type="button" title={skimOpen ? t("skim.exit") : t("skim.open")} aria-label={skimOpen ? t("skim.exit") : t("skim.open")} aria-pressed={skimOpen} onClick={onToggleSkim}><StableUiIcon name="skim" active={skimOpen} className="cap-stable-footer-icon cap-stable-skim-icon" /></button>
      <button className="cap-stable-settings-button" type="button" title={t("window.openSettings")} aria-label={t("window.openSettings")} onClick={onOpenSettings}>
        <StableUiIcon name="settings" className="cap-stable-footer-icon cap-stable-settings-icon" />
        <StableUiIcon name="settings" active className="cap-stable-footer-icon cap-stable-settings-icon-active" />
      </button>
    </div>
    {flyout?.kind === "directory" && <StableDirectoryFlyout anchor={flyout.anchor} directory={flyout.directory} directories={addedDirectories} onMove={onMoveDirectory} onOpen={onOpenDirectory} onEdit={onEditDirectory} onDelete={onDeleteDirectory} onClose={closeFlyout} />}
    {directoryTooltip && flyout === null && (() => { const directory = directories.find((candidate) => candidate.id === directoryTooltip.directoryId); return directory ? <StableDirectoryTooltip anchor={directoryTooltip.anchor} directory={directory} all={directoryTooltip.all} directoryCount={addedDirectories.length} /> : null; })()}
  </aside>;
};

export default StableShellSidebar;
