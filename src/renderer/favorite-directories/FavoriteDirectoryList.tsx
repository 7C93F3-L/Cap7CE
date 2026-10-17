import { useEffect, useState } from "react";
import { t } from "../../../electron/localization";
import type { FavoriteDirectory } from "../../shared/favoriteDirectoryTypes";
import "./FavoriteDirectoryList.css";
import StableUiIcon from "../stable-ui/StableUiIcon";
import StableSidebarIcon from "../stable-ui/StableSidebarIcons";
import StableDirectoryTooltip from "../stable-ui/StableDirectoryTooltip";
import type { CatalogWorkspaceAppearance } from "../../shared/catalogWorkspaceTypes";
import FavoriteDirectoryContextMenu, { type FavoriteContextTarget } from "./FavoriteDirectoryContextMenu";
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
  appearance?: Pick<CatalogWorkspaceAppearance, "theme" | "appearanceColors" | "windowMaterial">;
  onReveal?: (directory: FavoriteDirectory) => void;
  onCopyPath?: (directory: FavoriteDirectory) => void;
  onOpenNew?: (directory: FavoriteDirectory | null) => void;
  onMetadata?: (directory: FavoriteDirectory) => void; metadataMessage?: string;
  onAutoKeywords?: (directory: FavoriteDirectory) => void;
}

const pathKey = (value: string | null) => value?.replace(/[\\/]+$/, "").toLowerCase();

export default function FavoriteDirectoryList(props: FavoriteDirectoryListProps) {
  const [menu, setMenu] = useState<FavoriteContextTarget | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const tooltip = useFavoriteDirectoryTooltip(Boolean(props.showIcons) && !editing && !menu && !props.busy);
  useEffect(tooltip.hide, [props.directories, props.activePath, props.globalActive, tooltip.hide]);
  useEffect(() => {
    if (editing && !props.directories.some(item => item.id === editing)) setEditing(null);
  }, [editing, props.directories]);
  useEffect(() => setMenu(null), [props.directories, props.busy]);
  const showMenu = (button: HTMLButtonElement, directory: FavoriteDirectory) => {
    if (props.busy) return;
    tooltip.hide();
    setMenu({ directory, trigger: button, anchor: button.getBoundingClientRect() });
  };
  const save = async (id: string) => {
    if (props.busy || !draft.trim()) return;
    if (await props.onRename(id, draft)) setEditing(current => current === id ? null : current);
  };
  return <nav className="cap-favorite-directories" aria-label={t("favorites.title")} onScrollCapture={() => { tooltip.hide(); setMenu(null); }}>
    <button type="button" className="cap-favorite-open" aria-current={props.globalActive ? "page" : undefined}
      title={props.showIcons ? undefined : t("favorites.allFiles")} aria-label={props.showIcons ? t("skim.computer") : t("favorites.allFiles")}
      onPointerEnter={event => tooltip.show(event, null)} onPointerLeave={tooltip.hide} onPointerDown={tooltip.hide}
      onClick={event => (event.ctrlKey || event.metaKey) && props.onOpenNew ? props.onOpenNew(null) : props.onOpen(null)}>
      {props.showIcons && <CatalogToolbarIcon name="computer" />}<span className="cap-favorite-label">{props.showIcons ? t("skim.computer") : t("favorites.allFiles")}</span></button>
    <header><strong>{t("favorites.title")}</strong>
      <button type="button" disabled={props.busy} title={t("favorites.add")} aria-label={t("favorites.add")} onClick={props.onChoose}>{props.showIcons ? <StableSidebarIcon name="add" /> : "+"}</button>
    </header>
    <div className="cap-favorite-rows">
      {props.directories.map(directory => <div className={`cap-favorite-row${!props.globalActive && pathKey(directory.path) === pathKey(props.activePath) ? " is-selected" : ""}${menu?.directory.id === directory.id ? " is-menu-open" : ""}`} key={directory.id}>
        {editing === directory.id ? <form onSubmit={event => { event.preventDefault(); void save(directory.id); }}>
          <input autoFocus aria-label={t("favorites.renameFolder")} title={t("favorites.renameFolderHint")} maxLength={255} value={draft} disabled={props.busy}
            onChange={event => setDraft(event.currentTarget.value)} onKeyDown={event => {
              if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setEditing(null); }
            }} />
          <button type="submit" disabled={props.busy || !draft.trim()} title={t("common.save")} aria-label={t("common.save")}>✓</button>
          <button type="button" disabled={props.busy} title={t("common.cancel")} aria-label={t("common.cancel")} onClick={() => setEditing(null)}>×</button>
        </form> : <><button disabled={props.busy} className="cap-favorite-open" type="button" title={props.showIcons ? undefined : directory.path} aria-label={`${directory.name}; ${directory.path}`}
          onPointerEnter={event => tooltip.show(event, directory)} onPointerLeave={tooltip.hide} onPointerDown={tooltip.hide}
          onContextMenu={event => { event.preventDefault(); showMenu(event.currentTarget, directory); }}
          onKeyDown={event => { if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") { event.preventDefault(); showMenu(event.currentTarget, directory); } }}
          aria-current={!props.globalActive && pathKey(directory.path) === pathKey(props.activePath) ? "page" : undefined}
          onClick={event => (event.ctrlKey || event.metaKey) && props.onOpenNew ? props.onOpenNew(directory) : props.onOpen(directory)}>
          {props.showIcons && <StableUiIcon name="folder" active={!props.globalActive && pathKey(directory.path) === pathKey(props.activePath)} />}<span className="cap-favorite-label">{directory.name}</span></button>
          {props.showIcons && <button type="button" className="cap-favorite-more" disabled={props.busy} aria-label={t("common.manage")} title={t("common.manage")} aria-haspopup="menu" aria-expanded={menu?.directory.id === directory.id}
            onClick={event => showMenu(event.currentTarget, directory)}><StableSidebarIcon name="more" /></button>}</>}
      </div>)}
      {!props.busy && !props.error && !props.directories.length && <p>{t("favorites.empty")}</p>}
    </div>
    {props.error && <div className="cap-favorite-error" role="alert">{t("favorites.failed")} <button type="button" disabled={props.busy} onClick={props.onRetry}>{t("common.retry")}</button></div>}
    {props.metadataMessage && <div className="cap-favorite-error" role="status">{props.metadataMessage}</div>}
    {menu && <FavoriteDirectoryContextMenu target={menu} index={props.directories.findIndex(item => item.id === menu.directory.id)} count={props.directories.length} busy={props.busy}
      onMetadata={props.onMetadata ? () => props.onMetadata!(menu.directory) : undefined}
      onAutoKeywords={props.onAutoKeywords ? () => props.onAutoKeywords!(menu.directory) : undefined}
      appearance={props.appearance ?? { theme: "dark", appearanceColors: { themeColor: "#7894f8", accentColor: "#67bec1" }, windowMaterial: "mica" }} onClose={() => setMenu(null)}
      onRename={() => { setDraft(menu.directory.path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || menu.directory.name); setEditing(menu.directory.id); }}
      onRemove={() => props.onRemove(menu.directory.id)} onMove={direction => props.onMove(menu.directory.id, direction)}
      onReveal={props.onReveal ? () => props.onReveal!(menu.directory) : undefined} onCopyPath={props.onCopyPath ? () => props.onCopyPath!(menu.directory) : undefined} />}
    {tooltip.state && <StableDirectoryTooltip anchor={tooltip.state.anchor} directory={tooltip.state.directory ?? { name: t("skim.computer"), path: "" }} all={false} directoryCount={props.directories.length} hideFileCount />}
  </nav>;
}
