import { t } from "../../../electron/localization";
import StableSkimToolbar from "../stable-ui/StableSkimToolbar";
import type { StableSkimSlotProps } from "../stable-ui/stableSkimTypes";
import ComputerSearchView from "./ComputerSearchView";
import { useComputerSearchController } from "./useComputerSearchController";
import "../stable-ui/StableSkimPanel.css";
import "./ComputerSearch.css";

const ComputerSearchSkimSlot = ({
  content, isLoading, feedback, entryCount, onToggleSkim,
  theme, appearanceColors, windowMaterial, onNativeDragStateChange, foreground = true, ...toolbarProps
}:
  StableSkimSlotProps) => {
  const controller = useComputerSearchController(toolbarProps.currentPath, foreground);
  const search = {
    active: controller.active, query: controller.query, scopeLabel: controller.scopeLabel,
    canSubmit: controller.canSubmit, busy: controller.busy, onEnter: controller.enter,
    onExit: controller.exit, onQueryChange: controller.setQuery, onSubmit: controller.submit
  };
  const status = controller.active
    ? controller.error === "scope-offline" ? t("computerSearch.scopeOffline")
      : controller.error === "scope-not-indexed" ? t("computerSearch.scopeNotIndexed")
        : controller.error ? t("computerSearch.failed")
          : controller.busy && controller.items.length === 0 ? t("computerSearch.loading")
            : controller.submittedQuery ? t("computerSearch.resultCount", { scope: controller.scopeLabel,
              query: controller.submittedQuery, count: controller.items.length })
              : controller.status ? t(({
                "not-enabled": "computerSearch.state.notEnabled", starting: "computerSearch.state.starting",
                building: "computerSearch.state.building", syncing: "computerSearch.state.syncing",
                ready: "computerSearch.state.ready", offline: "computerSearch.state.offline",
                "needs-rebuild": "computerSearch.state.needsRebuild", "repair-required": "computerSearch.state.repairRequired",
                unavailable: "computerSearch.state.unavailable"
              } as const)[controller.status.state]) : t("computerSearch.state.starting")
    : feedback || (isLoading ? t("skim.loading") : t("skim.entryCount", { count: entryCount }));
  return <aside id="workspace-skim" className={`cap-stable-skim-slot${controller.active ? " is-computer-search-active" : ""}`} aria-label={t("skim.name")}>
    <StableSkimToolbar {...toolbarProps} foreground={foreground} search={search} onToggleSkim={onToggleSkim} />
    <div className="cap-stable-skim-status" role="status">{status}</div>
    <div className="cap-stable-skim-content"><div className="cap-computer-search-content">
      <div className={`cap-computer-search-browse${controller.active ? " is-hidden" : ""}`}>{content}</div>
      {controller.active && <ComputerSearchView
        controller={controller}
        foreground={foreground}
        theme={theme}
        appearanceColors={appearanceColors}
        windowMaterial={windowMaterial}
        onNativeDragStateChange={onNativeDragStateChange}
      />}
    </div></div>
  </aside>;
};

export default ComputerSearchSkimSlot;
