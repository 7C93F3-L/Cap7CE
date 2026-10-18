import "./CatalogDirectoryToolbar.css";
import type { MutableRefObject } from "react";
import type { CatalogCommandPage } from "../../shared/catalogCommandTypes";
import { useCatalogCommandInput } from "../quick-commands/useCatalogCommandInput";
import { t } from "../../../electron/localization";
import CatalogToolbarIcon from "./CatalogToolbarIcon";
import CatalogToolbarViewControls from "./CatalogToolbarViewControls";
import StableUiIcon from "../stable-ui/StableUiIcon";
import type { ComputerSearchSort } from "../../shared/computerSearchFactTypes";
import type { CatalogGridMode, CatalogRandomBrowseState } from "../../shared/catalogPresentationTypes";
import CatalogGridSizeControl from "./CatalogGridSizeControl";
import CatalogRandomControls from "./CatalogRandomControls";
export default function CatalogDirectoryToolbar({ path, canBack, canForward, canUp, onBack, onForward, onUp, onOpen, onHome,
  searchMode, onSearchMode, query, onQuery, onSubmit, enabled, inputRef, gridMode, onGridMode, includeSubfolders, onIncludeSubfolders, gridSize = 100, onGridSize, onGridSizeCommit, onRefresh, refreshing, sort, onSort, showHidden, onShowHidden, random, commandPage, active }: {
  commandPage?: CatalogCommandPage; active?: boolean;
  random: CatalogRandomBrowseState; path: string | null; canBack: boolean; canForward: boolean; canUp: boolean;
  onBack: () => void; onForward: () => void; onUp: () => void; onOpen: (path: string) => void; onHome: () => void;
  searchMode: boolean; onSearchMode: () => void; query: string; onQuery: (value: string) => void;
  onSubmit: (value?: string) => void; enabled: boolean; inputRef: MutableRefObject<HTMLInputElement | null>;
  gridMode: CatalogGridMode; onGridMode: () => void; onRefresh: () => void; refreshing: boolean;
  includeSubfolders: boolean; onIncludeSubfolders: () => void;
  gridSize?: number; onGridSize?: (size: number) => void; onGridSizeCommit?: (size: number, force?: boolean) => void;
  sort: ComputerSearchSort; onSort: (sort: ComputerSearchSort) => void; showHidden: boolean; onShowHidden: () => void;
}) {
  const input = useCatalogCommandInput({ path, query, searchMode, active, page: commandPage, onQuery, onSubmit, onOpen });
  const parts = (path ?? "").replace(/\\+$/, "").split("\\").filter(Boolean);
  return <form className="cap-catalog-directory-toolbar" onSubmit={event => {
    event.preventDefault(); void input.submit();
  }}>
    <button type="button" disabled={!canBack} aria-label={t("catalogWorkspace.back")} title={t("catalogWorkspace.back")} onClick={onBack}><CatalogToolbarIcon name="back" /></button>
    <button type="button" disabled={!canForward} aria-label={t("catalogWorkspace.forward")} title={t("catalogWorkspace.forward")} onClick={onForward}><CatalogToolbarIcon name="forward" /></button>
    <button type="button" disabled={!canUp} aria-label={t("catalogWorkspace.up")} title={t("catalogWorkspace.up")} onClick={onUp}><CatalogToolbarIcon name="up" /></button>
    <button type="button" aria-label={t("common.refresh")} title={`${t("common.refresh")} (F5)`} disabled={refreshing} onClick={onRefresh}><CatalogToolbarIcon name="refresh" /></button>
    <button className="cap-catalog-address-toggle" type="button" disabled={input.busy} title={searchMode ? "切换为目录路径" : "切换为搜索"} aria-label="切换搜索与路径" aria-pressed={searchMode} onClick={() => { input.cancel(); onSearchMode(); }}>{searchMode ? <StableUiIcon name="search" className="cap-catalog-toolbar-icon" /> : <CatalogToolbarIcon name="computer" />}</button>
    {searchMode ? <input ref={element => { inputRef.current = element; }} value={input.searchValue} readOnly={input.busy} disabled={!enabled && !commandPage} aria-label={t("computerSearch.placeholder", { scope: path ?? t("skim.computer") })}
      placeholder={input.awaiting ? t("catalogCommand.answer") : t("computerSearch.placeholder", { scope: path ?? t("skim.computer") })} onChange={event => input.change(event.currentTarget.value)}
      onKeyDown={event => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); input.escape(); } }} />
      : input.editing ? <input autoFocus value={input.pathValue} readOnly={input.busy} aria-label={t("catalogWorkspace.path")} placeholder={input.awaiting ? t("catalogCommand.answer") : undefined} onChange={event => input.change(event.currentTarget.value)}
        onBlur={input.blur} onKeyDown={event => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); input.escape(); } }} />
      : <div className="cap-catalog-breadcrumb" onClick={event => { if (!(event.target as HTMLElement).closest("button")) input.edit(); }} title="单击空白处输入路径">
        <div className="cap-catalog-breadcrumb-parts">
        <button type="button" onClick={() => { input.cancel(false, true); onHome(); }}>{t("skim.computer")}</button>
        {parts.map((part, index) => <span key={index}><i>›</i><button type="button" onClick={() => onOpen(parts.slice(0, index + 1).join("\\") + (index === 0 ? "\\" : ""))}>{part}</button></span>)}
        </div><button type="button" className="cap-catalog-address-edit" aria-label="编辑目录路径" title="编辑目录路径" onClick={input.edit} />
      </div>}
    {!searchMode && query.trim() && <button type="button" className="cap-catalog-search-badge" title={query} onClick={onSearchMode}>搜索中</button>}
    <CatalogRandomControls random={random} disabled={!enabled} busy={refreshing} />
    {onGridSize && onGridSizeCommit && <CatalogGridSizeControl size={gridSize} onPreview={onGridSize} onCommit={onGridSizeCommit} />}
    <button type="button" className="cap-catalog-grid-toggle" onClick={onGridMode} aria-label="网格切换" title={`网格切换 · 当前：${gridMode === "square" ? "方形网格" : "原比例网格"}；点击切换为${gridMode === "square" ? "原比例网格" : "方形网格"}`}><CatalogToolbarIcon name="grid" /></button>
    <CatalogToolbarViewControls randomEnabled={random.enabled} sort={sort} onSort={onSort} showHidden={showHidden} onShowHidden={onShowHidden}
      includeSubfolders={includeSubfolders} onIncludeSubfolders={onIncludeSubfolders} atHome={path === null} />
  </form>;
}
