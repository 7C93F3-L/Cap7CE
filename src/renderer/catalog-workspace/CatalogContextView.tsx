import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogContextActions, CatalogWorkspaceContext, CatalogWorkspaceAppearance } from "../../shared/catalogWorkspaceTypes";
import type { MetadataBuildProgress } from "../../shared/metadataBuildTypes";
import ComputerSearchView from "../computer-search/ComputerSearchView";
import CatalogPreparationNotice from "./CatalogPreparationNotice";
import { useComputerSearchController } from "../computer-search/useComputerSearchController";
import { useComputerSearchFilters } from "../computer-search/useComputerSearchFilters";
import { useComputerSearchMetadataRefresh } from "../computer-search/useComputerSearchMetadataRefresh";
import { useInertElement } from "../stable-ui/useInertElement";
import CatalogTopFilters from "./CatalogTopFilters";
import { workspaceFilterCount } from "../workspace/workspaceFilterSummary";
import CatalogDetails from "./CatalogDetails";
import CatalogQueryNotice from "./CatalogQueryNotice";
import type { CatalogSelection } from "../../shared/catalogPresentationTypes";
import CatalogDirectoryToolbar from "./CatalogDirectoryToolbar";
import { useCatalogDirectoryNavigation } from "./useCatalogDirectoryNavigation";
import CatalogHome from "./CatalogHome";
import { useCatalogViewOptions, useCatalogRefresh, useCatalogRandomBrowse } from "./useCatalogToolbarState";
import { useCatalogAttributeAvailability } from "./useCatalogAttributeAvailability";
import { useCatalogGridPresentation } from "./useCatalogGridPresentation";
import CatalogGridPreferenceNotice from "./CatalogGridPreferenceNotice";
import type { FavoriteDirectoryControls } from "../../shared/favoriteDirectoryTypes";
export default function CatalogContextView({ context, selected, foreground, filterHost, detailsHost, noticeHost, metadataProgress, onSearchAvailable, onActiveActions, onOpenBrowser, onLocation, onMetadata, onShowDetails, favorites, ...appearance }: CatalogWorkspaceAppearance & {
  favorites?: FavoriteDirectoryControls; onMetadata: () => void; onShowDetails?: () => void;
  context: CatalogWorkspaceContext; selected: boolean; foreground: boolean;
  filterHost: HTMLElement | null; detailsHost: HTMLElement | null; noticeHost?: HTMLElement | null;
  metadataProgress: MetadataBuildProgress | null; onSearchAvailable: (available: boolean) => void;
  onActiveActions: (actions: CatalogContextActions | null) => void;
  onOpenBrowser: (path: string | null) => void; onLocation: (id: string, path: string | null) => void;
}) {
  const random = useCatalogRandomBrowse(), filters = useComputerSearchFilters(true);
  const [searchMode, setSearchMode] = useState(Boolean(context.scopePath) && (context.favoritePath != null || context.kind === "search"));
  const [selection, setSelection] = useState<CatalogSelection | null>(null);
  const reportSelection = useCallback((value: CatalogSelection) => { setSelection(value); if (value.items.filter(item => !item.isDirectory).length > 1) onShowDetails?.(); }, [onShowDetails]);
  const querySetter = useRef<(value: string) => void>(() => {});
  const clearQuery = useCallback(() => querySetter.current(""), []);
  const navigation = useCatalogDirectoryNavigation(context.scopePath, clearQuery, context.kind === "browse");
  const view = useCatalogViewOptions(context.favoritePath ?? null, navigation.path, context.kind === "search" && context.scopePath !== null);
  const grid = useCatalogGridPresentation(context.favoritePath ?? null, navigation.path), gridMode = grid.mode;
  const dismissPreferenceError = useCallback(() => { grid.dismissError(); view.dismissError(); }, [grid.dismissError, view.dismissError]);
  useEffect(() => setSelection(null), [navigation.path]);
  const openDirectory = navigation.open;
  const toggleBrowser = useCallback(() => onOpenBrowser(navigation.path), [onOpenBrowser, navigation.path]);
  useEffect(() => onLocation(context.id, navigation.path), [context.id, navigation.path, onLocation]);
  const controller = useComputerSearchController(navigation.path, foreground, filters.conditions, undefined, true, navigation.browseChildren, navigation.path === null, { ...view.options, randomSeed: random.enabled ? random.seed : undefined });
  querySetter.current = controller.setQuery;
  const filterCount = workspaceFilterCount(filters.panel.search), searching = filterCount > 0 || Boolean(controller.query.trim());
  const attributes = useCatalogAttributeAvailability(navigation.path, filters.panel.search.selectedExtensions ?? [], foreground && controller.canSubmit, metadataProgress);
  useEffect(() => {
    if (navigation.path === null) setSearchMode(searching);
    else if (!selected && context.favoritePath != null) setSearchMode(true);
  }, [navigation.path, searching, selected, context.favoritePath]);
  const home = () => { filters.clear(); clearQuery(); setSearchMode(false); navigation.openBrowser(null); };
  const refresh = useCatalogRefresh(controller, navigation.path === null && !searching, foreground, navigation.path), inputRef = useRef<HTMLInputElement | null>(null);
  const actions = useMemo<CatalogContextActions>(() => ({ currentPath: navigation.path, browseChildren: !view.includeSubfolders,
    openBrowser: onOpenBrowser, toggleBrowser,
    focusSearch: () => { setSearchMode(true); requestAnimationFrame(() => inputRef.current?.focus()); }, refresh: refresh.refresh
  }), [navigation.path, view.includeSubfolders, onOpenBrowser, toggleBrowser, refresh.refresh]);
  useEffect(() => {
    if (!selected) return;
    onActiveActions(actions); return () => onActiveActions(null);
  }, [selected, actions, onActiveActions]);
  const observeMetadata = useComputerSearchMetadataRefresh(controller.active, foreground,
    controller.busy || controller.interactionBlocked || !controller.hasSubmitted, controller.refreshResults, Boolean(filters.conditions.facts));
  useEffect(() => { if (metadataProgress) observeMetadata(metadataProgress); }, [metadataProgress, observeMetadata]);
  useEffect(() => {
    if (foreground && controller.status && controller.status.state !== "starting") onSearchAvailable(controller.status.searchAvailable);
  }, [foreground, controller.status, onSearchAvailable]);
  const showHome = navigation.path === null && !random.enabled && !controller.query.trim() && !filters.conditions.facts && !filters.conditions.fileConditions;
  const ref = useInertElement<HTMLElement>(!foreground);
  return <section ref={ref} id={context.id} className="cap-catalog-context" hidden={!selected} role="tabpanel" aria-label={context.name}
    onKeyDown={event => { if (!event.defaultPrevented && event.altKey && !event.ctrlKey && !event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault(); event.key === "ArrowLeft" ? navigation.back() : navigation.forward();
    } }} onMouseUp={event => { if (event.button === 3 || event.button === 4) {
      event.preventDefault(); event.stopPropagation(); event.button === 3 ? navigation.back() : navigation.forward();
    } }} onMouseDown={event => { if (event.button === 3 || event.button === 4) event.preventDefault(); }}
    onAuxClick={event => { if (event.button === 3 || event.button === 4) event.preventDefault(); }}>
    {selected && filterHost && createPortal(<CatalogTopFilters {...filters.panel} count={filterCount} attributes={attributes} onMetadata={onMetadata} path={navigation.path} noticeHost={noticeHost} metadataProgress={metadataProgress} />, filterHost)}
    {selected && detailsHost && !showHome && createPortal(<CatalogDetails selection={selection?.taskId === controller.taskId ? selection : null} path={navigation.path} count={controller.items.length} foreground={foreground} searching={searching} filterCount={filterCount} />, detailsHost)}
    <CatalogDirectoryToolbar {...navigation} onBack={navigation.back} onForward={navigation.forward}
      onUp={navigation.up} onRefresh={() => void refresh.refresh()} refreshing={refresh.busy || controller.busy || !foreground}
      random={random} sort={view.sort} onSort={value => { random.disable(); view.setSort(value); }} showHidden={view.showHidden} onShowHidden={view.toggleHidden}
      onOpen={openDirectory} onHome={home} inputRef={inputRef}
      searchMode={searchMode} onSearchMode={() => setSearchMode(value => !value)} query={controller.query} onQuery={controller.setQuery}
      commandPage={{ ...view, home, refresh: refresh.refresh, setSort: value => { random.disable(); return view.setSort(value); } }} active={selected}
      onSubmit={value => void controller.submit(value)} enabled={controller.canSubmit} gridMode={gridMode} onGridMode={grid.toggle} includeSubfolders={view.includeSubfolders} onIncludeSubfolders={view.toggleSubfolders} gridSize={grid.size} onGridSize={grid.previewSize} onGridSizeCommit={grid.commitSize} />
    {selected && noticeHost && createPortal(<><CatalogPreparationNotice status={foreground ? controller.status : null} /><CatalogQueryNotice busy={foreground && controller.busy && !controller.canBrowse} invalid={foreground && filters.invalid} /></>, noticeHost)}
    <div className="cap-catalog-results">{showHome
      ? <CatalogHome onOpen={openDirectory} favorites={favorites} active={selected} detailsHost={selected ? detailsHost : null} gridMode={gridMode} gridSize={grid.size} foreground={foreground} refreshVersion={refresh.version} {...appearance} />
      : <ComputerSearchView controller={controller} favorites={favorites} foreground={foreground} onOpenDirectory={openDirectory} gridMode={gridMode} gridSize={grid.size} emptyHint={filters.conditions.facts ? "属性筛选只覆盖已提取属性的文件。可以放宽条件，或提取更多文件属性后再试。" : undefined} onSelectionChange={reportSelection} {...appearance} />}</div>
    {(grid.error || view.error) && <CatalogGridPreferenceNotice onDismiss={dismissPreferenceError} />}
  </section>;
}
