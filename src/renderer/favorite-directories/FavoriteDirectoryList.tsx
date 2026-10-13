import { useEffect, useState } from "react";
import { t } from "../../../electron/localization";
import type { FavoriteDirectory } from "../../shared/favoriteDirectoryTypes";
import "./FavoriteDirectoryList.css";
import StableUiIcon from "../stable-ui/StableUiIcon";
import StableSidebarIcon from "../stable-ui/StableSidebarIcons";
import StableDirectoryTooltip from "../stable-ui/StableDirectoryTooltip";
import CatalogToolbarIcon from "../catalog-workspace/CatalogToolbarIcon";
import { useFavoriteDirectoryTooltip } from "./useFavoriteDirectoryTooltip";

export interface FavoriteDirectoryListProps {
  directories: readonly FavoriteDirectory[];
  activePath: string | null;
  globalActive: boolean;
  busy: boolean;
  error: boolean;
  onOpen: (directory: FavoriteDirectory | null) => void;
  onChoose: () => void;
  onRetry: () => void;
  onRename: (id: string, name: string) => Promise<boolean>;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  showIcons?: boolean;
  onOpenNew?: (directory: FavoriteDirectory | null) => void;
}

const pathKey = (value: string | null) => value?.replace(/[\\/]+$/, "").toLowerCase();

export default function FavoriteDirectoryList(props: FavoriteDirectoryListProps) {
  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const tooltip = useFavoriteDirectoryTooltip(Boolean(props.showIcons) && !editing && !managing && !props.busy);
  useEffect(tooltip.hide, [props.directories, props.activePath, props.globalActive, tooltip.hide]);
  useEffect(() => {
    if (editing && !props.directories.some(item => item.id === editing)) setEditing(null);
  }, [editing, props.directories]);
  const save = async (id: string) => {
    if (props.busy || !draft.trim()) return;
    if (await props.onRename(id, draft.trim())) setEditing(current => current === id ? null : current);
  };
  return <nav className="cap-favorite-directories" aria-label={t("favorites.title")} onScrollCapture={tooltip.hide}>
    <button type="button" className="cap-favorite-open" aria-current={props.globalActive ? "page" : undefined}
      title={props.showIcons ? undefined : t("favorites.allFiles")} aria-label={props.showIcons ? t("skim.computer") : t("favorites.allFiles")}
      onPointerEnter={event => tooltip.show(event, null)} onPointerLeave={tooltip.hide} onPointerDown={tooltip.hide}
      onClick={event => (event.ctrlKey || event.metaKey) && props.onOpenNew ? props.onOpenNew(null) : props.onOpen(null)}>
      {props.showIcons && <CatalogToolbarIcon name="computer" />}<span className="cap-favorite-label">{props.showIcons ? t("skim.computer") : t("favorites.allFiles")}</span></button>
    <header><strong>{t("favorites.title")}</strong>
      <button type="button" disabled={props.busy} title={t("favorites.add")} aria-label={t("favorites.add")} onClick={props.onChoose}>{props.showIcons ? <StableSidebarIcon name="add" /> : "+"}</button>
      <button type="button" title={t("common.manage")} aria-label={t("common.manage")} aria-expanded={managing}
        onClick={() => { setManaging(value => !value); setEditing(null); }}>{props.showIcons ? <StableSidebarIcon name="more" /> : "⋯"}</button>
    </header>
    <div className="cap-favorite-rows">
      {props.directories.map((directory, index) => <div className="cap-favorite-row" key={directory.id}>
        {editing === directory.id ? <form onSubmit={event => { event.preventDefault(); void save(directory.id); }}>
          <input autoFocus aria-label={t("favorites.rename")} maxLength={256} value={draft} disabled={props.busy}
            onChange={event => setDraft(event.currentTarget.value)} onKeyDown={event => {
              if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setEditing(null); }
            }} />
          <button type="submit" disabled={props.busy || !draft.trim()} title={t("common.save")} aria-label={t("common.save")}>✓</button>
          <button type="button" disabled={props.busy} title={t("common.cancel")} aria-label={t("common.cancel")} onClick={() => setEditing(null)}>×</button>
        </form> : <button className="cap-favorite-open" type="button" title={props.showIcons ? undefined : directory.path} aria-label={`${directory.name}; ${directory.path}`}
          onPointerEnter={event => tooltip.show(event, directory)} onPointerLeave={tooltip.hide} onPointerDown={tooltip.hide}
          aria-current={!props.globalActive && pathKey(directory.path) === pathKey(props.activePath) ? "page" : undefined}
          onClick={event => (event.ctrlKey || event.metaKey) && props.onOpenNew ? props.onOpenNew(directory) : props.onOpen(directory)}>
          {props.showIcons && <StableUiIcon name="folder" active={!props.globalActive && pathKey(directory.path) === pathKey(props.activePath)} />}<span className="cap-favorite-label">{directory.name}</span></button>}
        {managing && editing !== directory.id && <div className="cap-favorite-actions">
          <button type="button" disabled={props.busy || index === 0} aria-label={t("favorites.up")} title={t("favorites.up")} onClick={() => props.onMove(directory.id, "up")}>↑</button>
          <button type="button" disabled={props.busy || index === props.directories.length - 1} aria-label={t("favorites.down")} title={t("favorites.down")} onClick={() => props.onMove(directory.id, "down")}>↓</button>
          <button type="button" disabled={props.busy} onClick={() => { setDraft(directory.name); setEditing(directory.id); }}>{t("favorites.rename")}</button>
          <button type="button" disabled={props.busy} title={t("favorites.removeHint")} onClick={() => props.onRemove(directory.id)}>{t("favorites.remove")}</button>
        </div>}
      </div>)}
      {!props.busy && !props.error && !props.directories.length && <p>{t("favorites.empty")}</p>}
    </div>
    {props.error && <div className="cap-favorite-error" role="alert">{t("favorites.failed")} <button type="button" disabled={props.busy} onClick={props.onRetry}>{t("common.retry")}</button></div>}
    {tooltip.state && <StableDirectoryTooltip anchor={tooltip.state.anchor} directory={tooltip.state.directory ?? { name: t("skim.computer"), path: "" }} all={false} directoryCount={props.directories.length} hideFileCount />}
  </nav>;
}
