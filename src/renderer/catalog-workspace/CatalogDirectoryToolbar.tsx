import { useEffect, useState, type MutableRefObject } from "react";
import { t } from "../../../electron/localization";
import type { CatalogGridMode } from "../../shared/catalogPresentationTypes";

export default function CatalogDirectoryToolbar({ path, canBack, canForward, canUp, onBack, onForward, onUp, onOpen, onHome,
  searchMode, onSearchMode, query, onQuery, onSubmit, enabled, inputRef, gridMode, onGridMode }: {
  path: string | null; canBack: boolean; canForward: boolean; canUp: boolean;
  onBack: () => void; onForward: () => void; onUp: () => void; onOpen: (path: string) => void; onHome: () => void;
  searchMode: boolean; onSearchMode: () => void; query: string; onQuery: (value: string) => void;
  onSubmit: () => void; enabled: boolean; inputRef: MutableRefObject<HTMLInputElement | null>;
  gridMode: CatalogGridMode; onGridMode: () => void;
}) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(path ?? "");
  useEffect(() => { setDraft(path ?? ""); setEditing(false); }, [path]);
  const parts = (path ?? "").replace(/\\+$/, "").split("\\").filter(Boolean);
  return <form className="cap-catalog-directory-toolbar" onSubmit={event => {
    event.preventDefault(); if (searchMode) onSubmit(); else if (draft.trim()) { onOpen(draft); setEditing(false); }
  }}>
    <button type="button" disabled={!canBack} aria-label={t("catalogWorkspace.back")} title={t("catalogWorkspace.back")} onClick={onBack}>←</button>
    <button type="button" disabled={!canForward} aria-label={t("catalogWorkspace.forward")} title={t("catalogWorkspace.forward")} onClick={onForward}>→</button>
    <button type="button" disabled={!canUp} aria-label={t("catalogWorkspace.up")} title={t("catalogWorkspace.up")} onClick={onUp}>↑</button>
    <button type="button" aria-label={t("skim.computer")} title={t("skim.computer")} onClick={onHome}>⌂</button>
    <button className="cap-catalog-address-toggle" type="button" title={searchMode ? "切换为目录路径" : "切换为搜索"} aria-label="切换搜索与路径" aria-pressed={searchMode} onClick={() => { setEditing(false); onSearchMode(); }}>{searchMode ? "⌕" : "▣"}</button>
    {searchMode ? <input ref={element => { inputRef.current = element; }} value={query} disabled={!enabled} aria-label={t("computerSearch.placeholder", { scope: path ?? t("skim.computer") })}
      placeholder={t("computerSearch.placeholder", { scope: path ?? t("skim.computer") })} onChange={event => onQuery(event.currentTarget.value)}
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onQuery(""); } }} />
      : editing ? <input autoFocus value={draft} aria-label={t("catalogWorkspace.path")} onChange={event => setDraft(event.currentTarget.value)}
        onBlur={() => setEditing(false)} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setEditing(false); setDraft(path ?? ""); } }} />
      : <div className="cap-catalog-breadcrumb" onDoubleClick={() => setEditing(true)} title="双击空白处输入路径">
        <button type="button" onClick={onHome}>{t("skim.computer")}</button>
        {parts.map((part, index) => <span key={index}><i>›</i><button type="button" onClick={() => onOpen(parts.slice(0, index + 1).join("\\") + (index === 0 ? "\\" : ""))}>{part}</button></span>)}
        <button className="cap-catalog-path-edit" type="button" title={t("catalogWorkspace.path")} onClick={() => setEditing(true)}>✎</button>
      </div>}
    {!searchMode && query.trim() && <button type="button" className="cap-catalog-search-badge" title={query} onClick={onSearchMode}>搜索中</button>}
    <button type="button" className="cap-catalog-grid-toggle" onClick={onGridMode} title={gridMode === "square" ? "切换为原比例网格" : "切换为方形网格"}>▦ <span>网格切换</span></button>
  </form>;
}
