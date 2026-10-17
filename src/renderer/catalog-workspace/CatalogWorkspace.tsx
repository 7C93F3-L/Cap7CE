import { useCallback, useRef, useState, type CSSProperties } from "react";
import { t } from "../../../electron/localization";
import type { MetadataBuildProgress } from "../../shared/metadataBuildTypes";
import FavoriteOperationNotice from "../favorite-directories/FavoriteOperationNotice";
import CatalogSidebar from "./CatalogSidebar";
import { useFavoriteDirectories } from "../favorite-directories/useFavoriteDirectories";
import { useInertElement } from "../stable-ui/useInertElement";
import { useCatalogLayout } from "./useCatalogLayout";
import { useCatalogDetailsWidth } from "./useCatalogDetailsWidth";
import CatalogDetailsResizer from "./CatalogDetailsResizer";
import CatalogContextView from "./CatalogContextView";
import type { CatalogContextActions, CatalogWorkspaceAppearance } from "../../shared/catalogWorkspaceTypes";
import { useCatalogWorkspaceContexts } from "./useCatalogWorkspaceContexts";
import MetadataBuildSlot from "../metadata-build/MetadataBuildSlot";
import "./CatalogWorkspace.css";
import "./CatalogDesign.css";
import { CatalogActivityProvider, CatalogActivityBar } from "./CatalogActivity";

export default function CatalogWorkspace({ foreground = true, interactionLocked = false, onOpenSettings, onActiveActions, ...appearance }: CatalogWorkspaceAppearance & {
  foreground?: boolean; interactionLocked?: boolean; onOpenSettings: () => void;
  onActiveActions?: (actions: CatalogContextActions | null) => void;
}) {
  const favorites = useFavoriteDirectories();
  const workspace = useCatalogWorkspaceContexts(favorites.directories);
  const layout = useCatalogLayout();
  const detailsLayout = useCatalogDetailsWidth(layout.width, layout.detailsVisible);
  const [filterHost, setFilterHost] = useState<HTMLDivElement | null>(null);
  const [detailsHost, setDetailsHost] = useState<HTMLDivElement | null>(null);
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
  const ref = useInertElement<HTMLElement>(!foreground || interactionLocked);
  return <CatalogActivityProvider><section ref={ref} className={`cap-catalog-workspace cap-catalog-design${layout.detailsVisible ? " has-details" : ""}`}
    style={{ "--cap-catalog-sidebar-width": `${layout.width}px`, "--cap-catalog-details-width": `${detailsLayout.width}px` } as CSSProperties}>
    <CatalogSidebar layout={layout} onSettings={onOpenSettings}
      favorites={{ ...favorites, appearance, onReveal: favorites.reveal, onCopyPath: favorites.copyPath, activePath: active.favoritePath ?? null, globalActive: active.favoritePath == null,
        onOpen: workspace.open, onChoose: () => void favorites.choose(), onRetry: () => void favorites.reload(),
        onRename: favorites.renameFolder, onRemove: id => void favorites.remove(id), onMove: (id, direction) => void favorites.move(id, direction) }} />
    <div className="cap-catalog-filter-host" hidden={!layout.filtersVisible} ref={setFilterHost} />
    <div className="cap-catalog-main">
    <div className="cap-catalog-body">
    <div className="cap-catalog-contexts">{workspace.contexts.map(context => <CatalogContextView key={context.id}
      context={context} selected={workspace.activeId === context.id} foreground={foreground && !interactionLocked && workspace.activeId === context.id}
      filterHost={layout.filtersVisible ? filterHost : null} detailsHost={layout.detailsVisible ? detailsHost : null}
      onOpenBrowser={workspace.openBrowser} onLocation={workspace.location} onMetadata={() => { if (!layout.metadataOpen) layout.toggleMetadata(); }}
      metadataProgress={metadataProgress} favorites={favorites} onSearchAvailable={setSearchAvailable} onActiveActions={reportActions} {...appearance} />)}</div>
      <div className="cap-catalog-activity-dock"><CatalogActivityBar />
      <MetadataBuildSlot floating controlsOpen={layout.metadataOpen} onRequestControls={layout.toggleMetadata} enabled={searchAvailable} foreground={foreground && !interactionLocked} onProgress={setMetadataProgress} /></div></div></div>
    <div className="cap-catalog-details-host" hidden={!layout.detailsVisible} ref={setDetailsHost}><CatalogDetailsResizer layout={detailsLayout} /></div>
    {favorites.notice && <FavoriteOperationNotice message={favorites.notice} onDismiss={favorites.dismissNotice} onRetry={() => void favorites.reload()} />}
    {workspace.openLimitReached && <div className="cap-catalog-limit" role="alert">{t("catalogWorkspace.limit")} <button type="button" onClick={workspace.dismissLimit}>{t("common.close")}</button></div>}
  </section></CatalogActivityProvider>;
}
