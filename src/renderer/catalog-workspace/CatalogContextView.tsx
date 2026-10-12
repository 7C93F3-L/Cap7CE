import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../../electron/localization";
import type { CatalogContextActions, CatalogWorkspaceContext, CatalogWorkspaceAppearance } from "../../shared/catalogWorkspaceTypes";
import type { MetadataBuildProgress } from "../../shared/metadataBuildTypes";
import ComputerSearchView from "../computer-search/ComputerSearchView";
import { useComputerSearchController } from "../computer-search/useComputerSearchController";
import { useComputerSearchFilters } from "../computer-search/useComputerSearchFilters";
import { useComputerSearchMetadataRefresh } from "../computer-search/useComputerSearchMetadataRefresh";
import { useInertElement } from "../stable-ui/useInertElement";
import CatalogTopFilters from "./CatalogTopFilters";
import { workspaceFilterCount } from "../workspace/workspaceFilterSummary";
import CatalogDetails from "./CatalogDetails";
import type { CatalogGridMode, CatalogSelection } from "../../shared/catalogPresentationTypes";
import CatalogDirectoryToolbar from "./CatalogDirectoryToolbar";
import { useCatalogDirectoryNavigation } from "./useCatalogDirectoryNavigation";
import CatalogAttributeNotice from "./CatalogAttributeNotice";
import CatalogHome from "./CatalogHome";
import { useCatalogAttributeAvailability } from "./useCatalogAttributeAvailability";

export default function CatalogContextView({ context, selected, foreground, filterHost, detailsHost, metadataProgress, onSearchAvailable, onActiveActions, onOpenBrowser, onLocation, onMetadata, ...appearance }: CatalogWorkspaceAppearance & {
  onMetadata: () => void;
  context: CatalogWorkspaceContext; selected: boolean; foreground: boolean;
  filterHost: HTMLElement | null; detailsHost: HTMLElement | null;
  metadataProgress: MetadataBuildProgress | null; onSearchAvailable: (available: boolean) => void;
  onActiveActions: (actions: CatalogContextActions | null) => void;
  onOpenBrowser: (path: string | null) => void; onLocation: (id: string, path: string | null) => void;
}) {
  const filters = useComputerSearchFilters(true);
  const [searchMode, setSearchMode] = useState(Boolean(context.scopePath));
  const [gridMode, setGridMode] = useState<CatalogGridMode>(context.scopePath ? "gallery" : "square");
  const [selection, setSelection] = useState<CatalogSelection | null>(null);
  const querySetter = useRef<(value: string) => void>(() => {});
  const clearQuery = useCallback(() => querySetter.current(""), []);
  const navigation = useCatalogDirectoryNavigation(context.scopePath, clearQuery, context.kind === "browse");
  useEffect(() => setSelection(null), [navigation.path]);
  const openDirectory = navigation.open;
  const toggleBrowser = useCallback(() => onOpenBrowser(navigation.path), [onOpenBrowser, navigation.path]);
  useEffect(() => onLocation(context.id, navigation.path), [context.id, navigation.path, onLocation]);
  const controller = useComputerSearchController(navigation.path, foreground, filters.conditions, undefined, true, navigation.browseChildren, navigation.path === null);
  querySetter.current = controller.setQuery;
  const filterCount = workspaceFilterCount(filters.panel.search), searching = filterCount > 0 || Boolean(controller.query.trim());
  const attributes = useCatalogAttributeAvailability(navigation.path, filters.panel.search.selectedExtensions ?? [], foreground && controller.canSubmit, metadataProgress);
  useEffect(() => { if (navigation.path === null) setSearchMode(searching); }, [navigation.path, searching]);
  const home = () => { filters.clear(); clearQuery(); setSearchMode(false); navigation.openBrowser(null); };

  const inputRef = useRef<HTMLInputElement | null>(null);
  const actions = useMemo<CatalogContextActions>(() => ({ currentPath: navigation.path, browseChildren: navigation.browseChildren,
    openBrowser: onOpenBrowser, toggleBrowser,
    focusSearch: () => { setSearchMode(true); requestAnimationFrame(() => inputRef.current?.focus()); }, refresh: async () => await controller.refreshResults() === "applied"
  }), [navigation.path, navigation.browseChildren, onOpenBrowser, toggleBrowser, controller.refreshResults]);
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
  const ref = useInertElement<HTMLElement>(!foreground);
  return <section ref={ref} id={context.id} className="cap-catalog-context" hidden={!selected} role="tabpanel" aria-label={context.name}
    onKeyDown={event => { if (!event.defaultPrevented && event.altKey && !event.ctrlKey && !event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault(); event.key === "ArrowLeft" ? navigation.back() : navigation.forward();
    } }} onMouseUp={event => { if (event.button === 3 || event.button === 4) {
      event.preventDefault(); event.stopPropagation(); event.button === 3 ? navigation.back() : navigation.forward();
    } }} onMouseDown={event => { if (event.button === 3 || event.button === 4) event.preventDefault(); }}
    onAuxClick={event => { if (event.button === 3 || event.button === 4) event.preventDefault(); }}>
    {selected && filterHost && createPortal(<CatalogTopFilters {...filters.panel} count={filterCount} attributes={attributes} />, filterHost)}
    {selected && detailsHost && createPortal(<CatalogDetails selection={selection?.taskId === controller.taskId ? selection : null} path={navigation.path} count={controller.items.length} foreground={foreground} searching={searching} filterCount={filterCount} />, detailsHost)}
    <CatalogDirectoryToolbar {...navigation} onBack={navigation.back} onForward={navigation.forward}
      onUp={navigation.up}
      onOpen={openDirectory} onHome={home} inputRef={inputRef}
      searchMode={searchMode} onSearchMode={() => setSearchMode(value => !value)} query={controller.query} onQuery={controller.setQuery}
      onSubmit={() => void controller.submit()} enabled={controller.canSubmit} gridMode={gridMode} onGridMode={() => setGridMode(value => value === "square" ? "gallery" : "square")} />
    <div className="cap-catalog-status" role="status">{filters.invalid ? t("computerSearch.invalidFilters") : controller.busy ? t("computerSearch.loading")
      : controller.hasSubmitted ? t("skim.entryCount", { count: controller.items.length }) : ""}</div>
    <div className="cap-catalog-results">{navigation.path === null && !controller.query.trim()
      && !filters.conditions.facts && !filters.conditions.fileConditions
      ? <CatalogHome volumes={controller.status?.volumes ?? []} onOpen={openDirectory} gridMode={gridMode} />
      : <ComputerSearchView controller={controller} foreground={foreground} onOpenDirectory={openDirectory} gridMode={gridMode} emptyHint={filters.conditions.facts ? "属性筛选只覆盖已提取属性的文件。可以放宽条件，或提取更多文件属性后再试。" : undefined} onSelectionChange={setSelection} {...appearance} />}</div>
    {attributes.relevant && <CatalogAttributeNotice key={JSON.stringify([navigation.path, attributes.message])} message={attributes.message} onMetadata={onMetadata} />}
  </section>;
}
