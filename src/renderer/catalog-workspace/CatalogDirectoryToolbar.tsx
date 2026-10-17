import "./CatalogDirectoryToolbar.css";
import { useEffect, useState, type MutableRefObject } from "react";
import { t } from "../../../electron/localization";
import CatalogToolbarIcon from "./CatalogToolbarIcon";
import CatalogToolbarViewControls from "./CatalogToolbarViewControls";
import StableUiIcon from "../stable-ui/StableUiIcon";
import type { ComputerSearchSort } from "../../shared/computerSearchFactTypes";
import type { CatalogGridMode, CatalogRandomBrowseState } from "../../shared/catalogPresentationTypes";
import CatalogGridSizeControl from "./CatalogGridSizeControl";
import CatalogRandomControls from "./CatalogRandomControls";
export default function CatalogDirectoryToolbar({ path, canBack, canForward, canUp, onBack, onForward, onUp, onOpen, onHome,
  searchMode, onSearchMode, query, onQuery, onSubmit, enabled, inputRef, gridMode, onGridMode, includeSubfolders, onIncludeSubfolders, gridSize = 100, onGridSize, onGridSizeCommit, onRefresh, refreshing, sort, onSort, showHidden, onShowHidden, random }: {
  random: CatalogRandomBrowseState; path: string | null; canBack: boolean; canForward: boolean; canUp: boolean;
  onBack: () => void; onForward: () => void; onUp: () => void; onOpen: (path: string) => void; onHome: () => void;
  searchMode: boolean; onSearchMode: () => void; query: string; onQuery: (value: string) => void;
  onSubmit: () => void; enabled: boolean; inputRef: MutableRefObject<HTMLInputElement | null>;
  gridMode: CatalogGridMode; onGridMode: () => void; onRefresh: () => void; refreshing: boolean;
  includeSubfolders: boolean; onIncludeSubfolders: () => void;
  gridSize?: number; onGridSize?: (size: number) => void; onGridSizeCommit?: (size: number, force?: boolean) => void;
  sort: ComputerSearchSort; onSort: (sort: ComputerSearchSort) => void; showHidden: boolean; onShowHidden: () => void;
}) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(path ?? "");
  useEffect(() => { setDraft(path ?? ""); setEditing(false); }, [path]);
  const parts = (path ?? "").replace(/\\+$/, "").split("\\").filter(Boolean);
  return <form className="cap-catalog-directory-toolbar" onSubmit={event => {
    event.preventDefault(); if (searchMode) onSubmit(); else if (draft.trim()) { onOpen(draft); setEditing(false); }
  }}>
    <button type="button" disabled={!canBack} aria-label={t("catalogWorkspace.back")} title={t("catalogWorkspace.back")} onClick={onBack}><CatalogToolbarIcon name="back" /></button>
    <button type="button" disabled={!canForward} aria-label={t("catalogWorkspace.forward")} title={t("catalogWorkspace.forward")} onClick={onForward}><CatalogToolbarIcon name="forward" /></button>
    <button type="button" disabled={!canUp} aria-label={t("catalogWorkspace.up")} title={t("catalogWorkspace.up")} onClick={onUp}><CatalogToolbarIcon name="up" /></button>
    <button type="button" aria-label={t("common.refresh")} title={`${t("common.refresh")} (F5)`} disabled={refreshing} onClick={onRefresh}><CatalogToolbarIcon name="refresh" /></button>
    <button className="cap-catalog-address-toggle" type="button" title={searchMode ? "切换为目录路径" : "切换为搜索"} aria-label="切换搜索与路径" aria-pressed={searchMode} onClick={() => { setEditing(false); onSearchMode(); }}>{searchMode ? <StableUiIcon name="search" className="cap-catalog-toolbar-icon" /> : <CatalogToolbarIcon name="computer" />}</button>
    {searchMode ? <input ref={element => { inputRef.current = element; }} value={query} disabled={!enabled} aria-label={t("computerSearch.placeholder", { scope: path ?? t("skim.computer") })}
      placeholder={t("computerSearch.placeholder", { scope: path ?? t("skim.computer") })} onChange={event => onQuery(event.currentTarget.value)}
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onQuery(""); } }} />
      : editing ? <input autoFocus value={draft} aria-label={t("catalogWorkspace.path")} onChange={event => setDraft(event.currentTarget.value)}
        onBlur={() => setEditing(false)} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setEditing(false); setDraft(path ?? ""); } }} />
      : <div className="cap-catalog-breadcrumb" onDoubleClick={() => setEditing(true)} title="双击空白处输入路径">
        <button type="button" onClick={onHome}>{t("skim.computer")}</button>
        {parts.map((part, index) => <span key={index}><i>›</i><button type="button" onClick={() => onOpen(parts.slice(0, index + 1).join("\\") + (index === 0 ? "\\" : ""))}>{part}</button></span>)}
      </div>}
    {!searchMode && query.trim() && <button type="button" className="cap-catalog-search-badge" title={query} onClick={onSearchMode}>搜索中</button>}
    <CatalogRandomControls random={random} disabled={!enabled} busy={refreshing} />
    {onGridSize && onGridSizeCommit && <CatalogGridSizeControl size={gridSize} onPreview={onGridSize} onCommit={onGridSizeCommit} />}
    <button type="button" className="cap-catalog-grid-toggle" onClick={onGridMode} aria-label="网格切换" title={`网格切换 · 当前：${gridMode === "square" ? "方形网格" : "原比例网格"}；点击切换为${gridMode === "square" ? "原比例网格" : "方形网格"}`}><CatalogToolbarIcon name="grid" /></button>
    <CatalogToolbarViewControls randomEnabled={random.enabled} sort={sort} onSort={onSort} showHidden={showHidden} onShowHidden={onShowHidden}
      includeSubfolders={includeSubfolders} onIncludeSubfolders={onIncludeSubfolders} atHome={path === null} />
  </form>;
}
