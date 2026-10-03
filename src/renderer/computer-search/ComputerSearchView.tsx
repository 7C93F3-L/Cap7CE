import { useRef } from "react";
import type { ComputerSearchState } from "../../../electron/computerSearchTypes";
import { t, type TranslationKey } from "../../../electron/localization";
import type { AppearanceColors, ResolvedThemeMode, WindowMaterial } from "../../shared/types";
import { MiddleEllipsisFileName, TwoLineMiddleEllipsisFileName } from "../components/MiddleEllipsisFileName";
import { getDirectoryPath } from "../filePath";
import StableUiIcon from "../stable-ui/StableUiIcon";
import ComputerSearchResultContextMenu from "./ComputerSearchResultContextMenu";
import ComputerSearchResultVisual from "./ComputerSearchResultVisual";
import { useComputerSearchResultActions } from "./useComputerSearchResultActions";
import type { ComputerSearchController } from "./useComputerSearchController";

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

const ComputerSearchView = ({ controller, theme, appearanceColors, windowMaterial, onNativeDragStateChange }: {
  controller: ComputerSearchController;
  theme: ResolvedThemeMode;
  appearanceColors: AppearanceColors;
  windowMaterial: WindowMaterial;
  onNativeDragStateChange: (active: boolean) => void;
}) => {
  const { status, items, busy, error, submittedQuery, nextCursor, scopeLabel, loadMore, refreshStatus,
    capabilityBusy, capabilityFeedback, capabilityOptions, configureCapability } = controller;
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const taskId = controller.taskId ?? "";
  const actions = useComputerSearchResultActions({
    items, taskId, theme, appearanceColors, onNativeDragStateChange
  });
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
      {status?.state === "unavailable" && <button type="button" onClick={() => void refreshStatus()}>{t("common.retry")}</button>}
    </section>;
  }
  if (!submittedQuery) return <section className="cap-computer-search-empty">
    <StableUiIcon name="search" /><strong>{t("computerSearch.placeholder", { scope: scopeLabel })}</strong>
    <span>{t("computerSearch.hint")}</span>
  </section>;
  if (error) return <section className="cap-computer-search-empty is-error"><StableUiIcon name="search" />
    <strong>{t(error === "scope-offline" ? "computerSearch.scopeOffline" : error === "scope-not-indexed" ? "computerSearch.scopeNotIndexed" : "computerSearch.failed")}</strong>
  </section>;
  if (!busy && items.length === 0) return <section className="cap-computer-search-empty"><StableUiIcon name="search" />
    <strong>{t("computerSearch.empty")}</strong><span>{t("computerSearch.emptyHint")}</span>
  </section>;
  return <section
    className="cap-computer-search-results"
    aria-busy={busy}
    ref={scrollContainerRef}
    onClick={() => actions.clearSelection()}
  >
    <div className="cap-computer-search-grid cap-skim-grid">{items.map((item) => {
      const selected = actions.selectedIds.has(item.authorizationId);
      const active = actions.activeId === item.authorizationId;
      return <button
        className={`cap-computer-search-entry cap-skim-entry${selected ? " selected" : ""}${active ? " active" : ""}`}
        type="button"
        key={item.authorizationId}
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
      >
        <ComputerSearchResultVisual item={item} taskId={taskId} scrollContainerRef={scrollContainerRef} />
        <TwoLineMiddleEllipsisFileName fileName={item.name} className="cap-computer-search-name cap-skim-entry-name" />
        <MiddleEllipsisFileName fileName={getDirectoryPath(item.path)} className="cap-computer-search-path cap-skim-entry-path" />
      </button>;
    })}</div>
    {nextCursor && <button className="cap-computer-search-more" type="button" disabled={busy} onClick={() => void loadMore()}>{busy ? t("computerSearch.loading") : t("computerSearch.loadMore")}</button>}
    {actions.feedback && <div className="cap-computer-search-feedback" role="status">{actions.feedback}</div>}
    {actions.contextMenu && <ComputerSearchResultContextMenu
      state={actions.contextMenu}
      theme={theme}
      appearanceColors={appearanceColors}
      windowMaterial={windowMaterial}
      onClose={() => actions.setContextMenu(null)}
      onAction={actions.handleContextMenuAction}
    />}
  </section>;
};

export default ComputerSearchView;
