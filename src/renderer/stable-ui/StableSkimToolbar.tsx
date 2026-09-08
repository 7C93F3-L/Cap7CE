import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { t, type TranslationKey } from "../../../electron/localization";
import type { SkimDisplayMode, SortDirection, SortField } from "../../shared/types";
import StableSidebarFlyout from "./StableSidebarFlyout";
import StableUiIcon from "./StableUiIcon";
import type { StableSkimProps } from "./stableSkimTypes";

type FlyoutState = { kind: "sort" | "scope"; anchor: DOMRect } | null;
type StableSkimToolbarProps = Omit<StableSkimProps, "renderContent" | "onOpen" | "isLoading" | "feedback" | "entryCount"> & { onToggleSkim: () => void };

const StableSkimToolbar = ({ currentPath, breadcrumbs, displayMode, sortField, sortDirection, onToggleSkim, onOpenRoot, onOpenPath, onDisplayModeChange, onSortChange }: StableSkimToolbarProps) => {
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState(currentPath ?? "");
  const [flyout, setFlyout] = useState<FlyoutState>(null);
  useEffect(() => { if (!editingPath) setPathDraft(currentPath ?? ""); }, [currentPath, editingPath]);
  const openFlyout = (kind: "sort" | "scope", event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const anchor = event.currentTarget.getBoundingClientRect();
    setFlyout((current) => current?.kind === kind ? null : { kind, anchor });
  };
  const submitPath = (event: FormEvent) => {
    event.preventDefault();
    const path = pathDraft.trim();
    setEditingPath(false);
    if (path) onOpenPath(path); else onOpenRoot();
  };
  const startPathEditing = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("button")) return;
    setEditingPath(true);
  };

  return <>
    <div className="cap-stable-skim-toolbar">
      <button className="cap-stable-skim-tool cap-stable-skim-exit-tool" type="button" title={t("skim.exit")} aria-label={t("skim.exit")} aria-pressed="true" onClick={() => { setFlyout(null); onToggleSkim(); }}>
        <StableUiIcon name="skim" active className="cap-stable-sidebar-icon cap-stable-skim-icon" />
      </button>
      {editingPath ? <form className="cap-stable-skim-address" onSubmit={submitPath}>
        <input autoFocus value={pathDraft} aria-label={t("stableUi.skim.path")} onChange={(event) => setPathDraft(event.currentTarget.value)} onBlur={() => setEditingPath(false)} onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); setPathDraft(currentPath ?? ""); setEditingPath(false); }
        }} />
      </form> : <div className="cap-stable-skim-address" title={currentPath ?? t("skim.computer")} onClick={startPathEditing}>
        <button type="button" onClick={onOpenRoot}>{t("skim.computer")}</button>
        {breadcrumbs.map((breadcrumb) => <span key={breadcrumb.path}><span aria-hidden="true">›</span><button type="button" title={breadcrumb.path} onClick={() => onOpenPath(breadcrumb.path)}>{breadcrumb.name}</button></span>)}
        <span className="cap-stable-skim-address-hit-area" aria-hidden="true" />
      </div>}
      <button className="cap-stable-skim-tool" type="button" title={t("sort.parent")} aria-label={t("sort.parent")} aria-expanded={flyout?.kind === "sort"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => openFlyout("sort", event)}><StableUiIcon name="sort" sortDirection={sortDirection} className="cap-stable-sidebar-icon cap-stable-sort-icon" /></button>
      <button className="cap-stable-skim-tool" type="button" title={t("skim.display.parent")} aria-label={t("skim.display.parent")} aria-expanded={flyout?.kind === "scope"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => openFlyout("scope", event)}><StableUiIcon name="scope" active={flyout?.kind === "scope"} /></button>
    </div>
    {flyout?.kind === "sort" && <StableSidebarFlyout anchor={flyout.anchor} label={t("sort.parent")} placement="below" onClose={() => setFlyout(null)}>
      {(["modified_at", "file_name"] as SortField[]).map((field) => <button type="button" className={sortField === field ? "is-selected" : ""} key={field} onClick={() => { onSortChange(field, sortDirection); setFlyout(null); }}>{field === "modified_at" ? t("sort.field.modifiedAt") : t("sort.field.name")}</button>)}
      {(["desc", "asc"] as SortDirection[]).map((direction) => <button type="button" className={sortDirection === direction ? "is-selected" : ""} key={direction} onClick={() => { onSortChange(sortField, direction); setFlyout(null); }}>{direction === "desc" ? t("sort.direction.desc") : t("sort.direction.asc")}</button>)}
    </StableSidebarFlyout>}
    {flyout?.kind === "scope" && <StableSidebarFlyout anchor={flyout.anchor} label={t("skim.display.parent")} placement="below" onClose={() => setFlyout(null)}>
      {(["skim", "all", "custom"] as SkimDisplayMode[]).map((mode) => <button type="button" className={displayMode === mode ? "is-selected" : ""} key={mode} onClick={() => { onDisplayModeChange(mode); setFlyout(null); }}>{t(`skim.display.${mode}` as TranslationKey)}</button>)}
    </StableSidebarFlyout>}
  </>;
};

export default StableSkimToolbar;
