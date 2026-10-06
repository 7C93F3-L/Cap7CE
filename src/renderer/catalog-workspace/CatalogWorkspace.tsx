import { useCallback, useRef, useState } from "react";
import { t } from "../../../electron/localization";
import type { MetadataBuildProgress } from "../../shared/metadataBuildTypes";
import FavoriteDirectoryList from "../favorite-directories/FavoriteDirectoryList";
import { useFavoriteDirectories } from "../favorite-directories/useFavoriteDirectories";
import { useInertElement } from "../stable-ui/useInertElement";
import StableUiIcon from "../stable-ui/StableUiIcon";
import WorkspaceTabBar from "../workspace/WorkspaceTabBar";
import CatalogContextView from "./CatalogContextView";
import type { CatalogContextActions, CatalogWorkspaceAppearance } from "../../shared/catalogWorkspaceTypes";
import { useCatalogWorkspaceContexts } from "./useCatalogWorkspaceContexts";
import MetadataBuildSlot from "../metadata-build/MetadataBuildSlot";
import "./CatalogWorkspace.css";

export default function CatalogWorkspace({ foreground = true, interactionLocked = false, onOpenSettings, onActiveActions, ...appearance }: CatalogWorkspaceAppearance & {
  foreground?: boolean; interactionLocked?: boolean; onOpenSettings: () => void;
  onActiveActions?: (actions: CatalogContextActions | null) => void;
}) {
  const favorites = useFavoriteDirectories();
  const workspace = useCatalogWorkspaceContexts(favorites.directories);
  const [sidebarVisible, setSidebarVisible] = useState(() => window.innerWidth >= 850 && window.innerHeight >= 360);
  const [filterHost, setFilterHost] = useState<HTMLDivElement | null>(null);
  const [searchAvailable, setSearchAvailable] = useState(false);
  const [metadataProgress, setMetadataProgress] = useState<MetadataBuildProgress | null>(null);
  const activeActions = useRef<CatalogContextActions | null>(null), report = useRef(onActiveActions);
  report.current = onActiveActions;
  const cycleFavorite = useCallback(() => {
    const index = favorites.directories.findIndex(directory => directory.path === activeActions.current?.currentPath);
    workspace.open(favorites.directories[index + 1] ?? null);
  }, [favorites.directories, workspace.open]);
  const reportActions = useCallback((actions: CatalogContextActions | null) => {
    activeActions.current = actions;
    report.current?.(actions ? { ...actions, cycleFavorite } : null);
  }, [cycleFavorite]);
  const active = workspace.contexts.find(context => context.id === workspace.activeId)!;
  const browsing = active.kind === "browse";
  const ref = useInertElement<HTMLElement>(!foreground || interactionLocked);
  return <section ref={ref} className={`cap-catalog-workspace${sidebarVisible ? " has-sidebar" : ""}`}>
    <nav className="cap-catalog-rail" aria-label={t("workspace.navigation")}>
      <button type="button" aria-label={t("skim.name")} title={t("skim.name")} aria-pressed={browsing}
        onClick={() => activeActions.current?.toggleBrowser()}><StableUiIcon name="skim" active={browsing} /></button>
      <button type="button" aria-label={t("favorites.title")} title={t("favorites.title")} aria-expanded={sidebarVisible}
        onClick={() => setSidebarVisible(value => !value)}><StableUiIcon name="folder" active={sidebarVisible} /></button>
      <button type="button" className="cap-catalog-settings" aria-label={t("window.openSettings")} title={t("window.openSettings")} onClick={onOpenSettings}><StableUiIcon name="settings" /></button>
    </nav>
    <header className="cap-catalog-header"><WorkspaceTabBar tabs={workspace.contexts.map(context => ({ id: context.id,
      controlsId: context.id, name: context.id === "catalog:all" ? t("favorites.allFiles") : context.name,
      path: context.scopePath ?? undefined, closable: context.id !== "catalog:all" }))}
      activeId={workspace.activeId} onSelect={workspace.select} onClose={workspace.close} /></header>
    <aside className="cap-catalog-sidebar" hidden={!sidebarVisible}>
      <FavoriteDirectoryList {...favorites} activePath={active.scopePath} globalActive={active.scopePath === null}
        onOpen={workspace.open} onChoose={() => void favorites.choose()} onRetry={() => void favorites.reload()}
        onRename={favorites.rename} onRemove={id => void favorites.remove(id)} onMove={(id, direction) => void favorites.move(id, direction)} />
      <div className="cap-catalog-filter-host" ref={setFilterHost} />
    </aside>
    <div className="cap-catalog-body"><MetadataBuildSlot enabled={searchAvailable} foreground={foreground && !interactionLocked} onProgress={setMetadataProgress} />
    <div className="cap-catalog-contexts">{workspace.contexts.map(context => <CatalogContextView key={context.id}
      context={context} selected={workspace.activeId === context.id} foreground={foreground && !interactionLocked && workspace.activeId === context.id}
      filterHost={sidebarVisible ? filterHost : null} onHideSidebar={() => setSidebarVisible(false)}
      onOpenBrowser={workspace.openBrowser} onToggleBrowser={workspace.toggleBrowser}
      metadataProgress={metadataProgress} onSearchAvailable={setSearchAvailable} onActiveActions={reportActions} {...appearance} />)}</div></div>
    {workspace.openLimitReached && <div className="cap-catalog-limit" role="alert">{t("catalogWorkspace.limit")} <button type="button" onClick={workspace.dismissLimit}>{t("common.close")}</button></div>}
  </section>;
}
