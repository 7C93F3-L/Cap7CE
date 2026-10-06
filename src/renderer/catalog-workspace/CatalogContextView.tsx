import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { t } from "../../../electron/localization";
import type { CatalogContextActions, CatalogWorkspaceContext, CatalogWorkspaceAppearance } from "../../shared/catalogWorkspaceTypes";
import type { MetadataBuildProgress } from "../../shared/metadataBuildTypes";
import ComputerSearchView from "../computer-search/ComputerSearchView";
import { useComputerSearchController } from "../computer-search/useComputerSearchController";
import { useComputerSearchFilters } from "../computer-search/useComputerSearchFilters";
import { useComputerSearchMetadataRefresh } from "../computer-search/useComputerSearchMetadataRefresh";
import { useInertElement } from "../stable-ui/useInertElement";
import WorkspaceFilterPanel from "../workspace/WorkspaceFilterPanel";
import { workspaceFilterCount } from "../workspace/workspaceFilterSummary";
import CatalogQueryToolbar from "./CatalogQueryToolbar";
import CatalogDirectoryToolbar from "./CatalogDirectoryToolbar";
import { useCatalogDirectoryNavigation } from "./useCatalogDirectoryNavigation";
import CatalogVolumeGrid from "./CatalogVolumeGrid";

export default function CatalogContextView({ context, selected, foreground, filterHost, onHideSidebar, metadataProgress, onSearchAvailable, onActiveActions, onOpenBrowser, onToggleBrowser, ...appearance }: CatalogWorkspaceAppearance & {
  context: CatalogWorkspaceContext; selected: boolean; foreground: boolean;
  filterHost: HTMLElement | null; onHideSidebar: () => void;
  metadataProgress: MetadataBuildProgress | null; onSearchAvailable: (available: boolean) => void;
  onActiveActions: (actions: CatalogContextActions | null) => void;
  onOpenBrowser: (path: string | null) => void; onToggleBrowser: (path: string | null) => void;
}) {
  const filters = useComputerSearchFilters(true);
  const querySetter = useRef<(value: string) => void>(() => {});
  const clearQuery = useCallback(() => querySetter.current(""), []);
  const navigation = useCatalogDirectoryNavigation(context.scopePath, clearQuery, context.kind === "browse");
  const openDirectory = context.kind === "browse" ? navigation.open : onOpenBrowser;
  const toggleBrowser = useCallback(() => onToggleBrowser(navigation.path), [onToggleBrowser, navigation.path]);
  const controller = useComputerSearchController(navigation.path, foreground, filters.conditions, undefined, true, navigation.browseChildren);
  querySetter.current = controller.setQuery;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const actions = useMemo<CatalogContextActions>(() => ({ currentPath: navigation.path, browseChildren: navigation.browseChildren,
    openBrowser: onOpenBrowser, toggleBrowser,
    focusSearch: () => inputRef.current?.focus(), refresh: async () => await controller.refreshResults() === "applied"
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
    {selected && filterHost && createPortal(<WorkspaceFilterPanel {...filters.panel} count={workspaceFilterCount(filters.panel.search)} onClose={onHideSidebar} />, filterHost)}
    <CatalogDirectoryToolbar {...navigation} onBack={navigation.back} onForward={navigation.forward}
      onUp={context.kind === "browse" ? navigation.up : () => onOpenBrowser(navigation.parentPath)}
      onOpen={openDirectory} onReset={context.kind === "browse" ? toggleBrowser : navigation.reset} />
    <CatalogQueryToolbar inputRef={inputRef} name={controller.scopeLabel} query={controller.query} enabled={controller.canSubmit} busy={controller.busy}
      onChange={controller.setQuery} onSubmit={() => void controller.submit()} />
    <div className="cap-catalog-status" role="status">{filters.invalid ? t("computerSearch.invalidFilters") : controller.busy ? t("computerSearch.loading")
      : controller.hasSubmitted ? t("skim.entryCount", { count: controller.items.length }) : ""}</div>
    <div className="cap-catalog-results">{navigation.browseChildren && navigation.path === null && !controller.submittedQuery
      && !filters.conditions.facts && !filters.conditions.fileConditions && controller.status?.searchAvailable
      ? <CatalogVolumeGrid volumes={controller.status.volumes} onOpen={navigation.open} />
      : <ComputerSearchView controller={controller} foreground={foreground} onOpenDirectory={openDirectory} {...appearance} />}</div>
  </section>;
}
