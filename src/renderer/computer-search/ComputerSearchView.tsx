import { useCallback, useEffect, useMemo, useRef } from "react";
import type { FavoriteDirectoryControls } from "../../shared/favoriteDirectoryTypes";
import { useComputerSearchFileOperations } from "./useComputerSearchFileOperations";
import type { ComputerSearchState } from "../../../electron/computerSearchTypes";
import { t, type TranslationKey } from "../../../electron/localization";
import type { AppearanceColors, ResolvedThemeMode, WindowMaterial } from "../../shared/types";
import StableUiIcon from "../stable-ui/StableUiIcon";
import ComputerSearchResultContextMenu from "./ComputerSearchResultContextMenu";
import CatalogResultTile from "./CatalogResultTile";
import type { CatalogGridMode, CatalogSelection } from "../../shared/catalogPresentationTypes";
import { useComputerSearchResultActions } from "./useComputerSearchResultActions";
import type { ComputerSearchController } from "./useComputerSearchController";
import { useComputerSearchScrollPaging } from "./useComputerSearchScrollPaging";
import CatalogVirtualGrid from "./CatalogVirtualGrid";
import CatalogTransientFeedback from "../catalog-workspace/CatalogTransientFeedback";
import { useGridSelectionDismissal } from "../results/useGridSelectionDismissal";
import "../results/ResultGrid.css";
import "./ComputerSearchResultGrid.css";

const stateKeys: Record<ComputerSearchState, TranslationKey> = {
  "not-enabled": "computerSearch.state.notEnabled",
  starting: "computerSearch.state.starting",
  building: "computerSearch.state.building",
  syncing: "computerSearch.state.syncing",
  ready: "computerSearch.state.ready",
  offline: "computerSearch.state.offline",
  "needs-rebuild": "computerSearch.state.needsRebuild",
  "repair-required": "computerSearch.state.repairRequired",
  unavailable: "computerSearch.state.unavailable"
};

const ComputerSearchView = ({ controller, theme, appearanceColors, windowMaterial, onNativeDragStateChange, foreground = true, onOpenDirectory, gridMode = "square", gridSize = 100, emptyHint, onSelectionChange, favorites }: {
  favorites?: FavoriteDirectoryControls;
  controller: ComputerSearchController;
  emptyHint?: string;
  foreground?: boolean;
  onOpenDirectory?: (path: string) => void;
  gridMode?: CatalogGridMode;
  gridSize?: number;
  onSelectionChange?: (selection: CatalogSelection) => void;
  theme: ResolvedThemeMode;
  appearanceColors: AppearanceColors;
  windowMaterial: WindowMaterial;
  onNativeDragStateChange: (active: boolean) => void;
}) => {
  const { status, items, busy, error, pageError, hasSubmitted, nextCursor, scopeLabel, loadMore, refreshStatus,
    capabilityBusy, capabilityFeedback, capabilityOptions, configureCapability } = controller;
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const pageEndRef = useRef<HTMLDivElement | null>(null);
  useComputerSearchScrollPaging(scrollContainerRef, pageEndRef,
    foreground && Boolean(status?.searchAvailable) && hasSubmitted && !busy && !error,
    nextCursor, loadMore, controller.directoryListing, Boolean(pageError));
  const taskId = controller.taskId ?? "";
  const operations = useComputerSearchFileOperations(taskId, favorites), clearSelection = useRef(() => {});
  const trash = useCallback((targets: typeof items) => { void operations.trash(targets).then(changed => { if (changed) clearSelection.current(); }); }, [operations.trash]);
  const actions = useComputerSearchResultActions({
    items, taskId, theme, appearanceColors, onNativeDragStateChange, foreground: foreground && !operations.busy, onOpenDirectory, onDelete: trash
  });
  clearSelection.current = actions.clearSelection;
  const dismissSelection = useGridSelectionDismissal({ rootRef: scrollContainerRef, foreground,
    hasSelection: actions.selectedIds.size > 0 || actions.activeId !== null, menuOpen: actions.contextMenu !== null, onClear: actions.clearSelection });
  const interactionBlocked = operations.busy || actions.selectedIds.size > 0 || actions.contextMenu !== null;
  const selection = useMemo(() => ({ items: actions.selectedItems, taskId,
      openPreview: () => { if (actions.selectedItems[0]) void actions.openPreview(actions.selectedItems[0]); },
      showInFolder: () => { if (actions.selectedItems[0]) actions.showInFolder(actions.selectedItems[0]); }
    }), [actions.selectedItems, actions.openPreview, actions.showInFolder, taskId]);
  useEffect(() => { onSelectionChange?.(selection); }, [selection, onSelectionChange]);
  useEffect(() => {
    controller.setInteractionBlocked(interactionBlocked);
    return () => controller.setInteractionBlocked(false);
  }, [controller.setInteractionBlocked, interactionBlocked]);
  if (!status || !status.searchAvailable) {
    const progress = status?.volumes.reduce((total, volume) => total + volume.processed, 0) ?? 0;
    return <section className="cap-computer-search-state">
      <StableUiIcon name="search" />
      {status?.state !== "not-enabled" && <strong>{status ? t(stateKeys[status.state]) : t("computerSearch.state.starting")}</strong>}
      {progress > 0 && <span>{t("common.countItems", { count: progress.toLocaleString() })}</span>}
      {capabilityFeedback === "restart-required" && <span>{t("computerSearch.capability.restartRequired")}</span>}
      {capabilityFeedback === "unavailable" && <span>{t("computerSearch.capability.unavailable")}</span>}
      {capabilityFeedback === "failed" && <span>{t("computerSearch.capability.failed")}</span>}
      {capabilityBusy && capabilityOptions?.runtimeInstall.phase === "downloading" && <span>{
        capabilityOptions.runtimeInstall.totalBytes ? t("computerSearch.capability.downloadingPercent", {
          percent: Math.min(100, Math.round(capabilityOptions.runtimeInstall.receivedBytes
            / capabilityOptions.runtimeInstall.totalBytes * 100))
        }) : t("computerSearch.capability.downloading")}</span>}
      {capabilityBusy && capabilityOptions?.runtimeInstall.phase === "verifying"
        && <span>{t("computerSearch.capability.verifying")}</span>}
      {capabilityBusy && capabilityOptions?.runtimeInstall.phase === "installing"
        && <span>{t("computerSearch.capability.installingRuntime")}</span>}
      {status?.state === "repair-required" && <button type="button" disabled={capabilityBusy}
        onClick={() => void configureCapability("repair")}>{t(capabilityBusy
          ? "computerSearch.capability.preparing" : "computerSearch.capability.repair")}</button>}
      {status?.state === "not-enabled" && <button type="button" disabled={capabilityBusy}
        onClick={() => void configureCapability("enable")}>{t(capabilityBusy
          ? "computerSearch.capability.preparing" : "computerSearch.capability.enable")}</button>}
      {status?.state === "unavailable" && <button type="button" onClick={() => void refreshStatus()}>{t("common.retry")}</button>}
    </section>;
  }
  if (!hasSubmitted) return <section className="cap-computer-search-empty">
    <StableUiIcon name="search" /><strong>{t("computerSearch.placeholder", { scope: scopeLabel })}</strong>
    <span>{t("computerSearch.hint")}</span>
  </section>;
  if (error) return <section className={`cap-computer-search-empty${error === "scope-preparing" ? "" : " is-error"}`} aria-busy={error === "scope-preparing"}><StableUiIcon name="search" />
    <strong>{t(error === "random-unavailable" ? "computerSearch.randomUnavailable" : error === "scope-offline" ? "computerSearch.scopeOffline" : error === "scope-preparing" ? "computerSearch.scopePreparing" : error === "scope-not-indexed" ? "computerSearch.scopeNotIndexed" : "computerSearch.failed")}</strong>
  </section>;
  if (!busy && items.length === 0) return <section className="cap-computer-search-empty"><StableUiIcon name="search" />
    <strong>{controller.query.trim() ? t("computerSearch.empty") : "没有符合当前条件的文件"}</strong><span>{emptyHint ?? (controller.query.trim() ? t("computerSearch.emptyHint") : "可以减少筛选条件或切换搜索范围。")}</span>
  </section>;
  return <section
    className="cap-computer-search-results"
    aria-busy={busy}
    ref={scrollContainerRef}
    onClick={dismissSelection}
  >
    <CatalogVirtualGrid items={items} mode={gridMode} size={gridSize} rootRef={scrollContainerRef} renderItem={(item, style, onRatio) => {
      const selected = actions.selectedIds.has(item.authorizationId);
      const active = actions.activeId === item.authorizationId;
      return <CatalogResultTile item={item} visual={{ taskId, scrollContainerRef, foreground, showName: true }}
        style={style} onRatio={onRatio}
        className="cap-computer-search-entry" selected={selected} active={active}
        type="button"
        key={item.id}
        title={item.path}
        aria-label={item.name}
        aria-pressed={selected}
        draggable
        onClick={(event) => {
          event.stopPropagation();
          actions.selectItem(item, event.ctrlKey || event.metaKey, event.shiftKey);
          actions.setContextMenu(null);
        }}
        onDoubleClick={() => actions.openItem(item)}
        onContextMenu={(event) => actions.openContextMenu(event, item)}
        onDragStart={(event) => { event.preventDefault(); actions.startDrag(item); }}
        onDragEnd={actions.finishDrag}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.shiftKey) {
            event.preventDefault();
            actions.openItem(item);
          } else if (event.code === "Space") {
            event.preventDefault();
            if (!event.repeat) void actions.openPreview(item);
          }
        }}
      />;
    }} />
    {nextCursor && <div ref={pageEndRef} className="cap-computer-search-page-status" role="status">
      {pageError && !busy ? <span>{t("computerSearch.pageFailed")}</span>
        : busy ? t("computerSearch.pageLoading") : null}
    </div>}
    <CatalogTransientFeedback message={operations.feedback || actions.feedback} />
    {actions.contextMenu && <ComputerSearchResultContextMenu
      state={actions.contextMenu}
      theme={theme}
      appearanceColors={appearanceColors}
      windowMaterial={windowMaterial}
      onClose={() => actions.setContextMenu(null)}
      favoriteAction={operations.favoriteAction(actions.contextMenu.item)} favoriteBusy={favorites?.busy}
      onAction={action => { const state = actions.contextMenu!; if (action === "delete") trash(state.items);
        else if (action === "metadata") { actions.setContextMenu(null); void operations.metadata(state.item.path); }
        else if (action === "addToSidebar") void operations.toggleFavorite(state.item); else actions.handleContextMenuAction(action); }}
    />}
  </section>;
};

export default ComputerSearchView;
