import { useEffect, useRef, useState, type CSSProperties } from "react";
import { t } from "../../../electron/localization";
import type {
  GgufModelSettings,
  LlamaRuntimeProcessState,
  LlamaRuntimeSettings
} from "../../shared/types";
import { formatCacheSize } from "../formatting";
import { SettingsSelect } from "./SettingsSelect";
import { RuntimeDiagnosticsRows } from "./RuntimeDiagnosticsRows";

const getLlamaRuntimeStatusLabel = (settings: LlamaRuntimeSettings) => {
  if (settings.status === "available") return t("common.available");
  if (settings.status === "unselected") return t("common.unselected");
  if (settings.status === "missing_root") return t("runtime.rootMissing");
  if (settings.status === "missing_server") return t("runtime.noneFound");
  return t("runtime.selectionMissing");
};

const getLlamaRuntimeProcessStatusLabel = (state: LlamaRuntimeProcessState) => {
  if (state.status === "starting") return t("common.starting");
  if (state.status === "running") return t("common.running");
  if (state.status === "failed") return t("runtime.startFailed");
  return t("common.stopped");
};

const getGgufModelStatusLabel = (
  settings: GgufModelSettings,
  processState: LlamaRuntimeProcessState
) => {
  const processMatchesSelection = processState.selectedModelId === settings.selectedModelId;
  if (processMatchesSelection && processState.modelStatus === "loading") return t("common.loading");
  if (processMatchesSelection && processState.modelStatus === "loaded") return t("common.loaded");
  if (processMatchesSelection && processState.modelStatus === "load_failed") return t("common.loadFailed");
  if (settings.status === "unpaired") return t("model.unpaired");
  if (settings.status === "ready") return t("model.paired");
  if (settings.status === "selection_missing") return t("model.selectionMissing");
  if (settings.status === "missing_directory") return t("model.directoryMissing");
  return t("common.unselected");
};

const joinDisplayPath = (root: string, relativePath?: string) => {
  if (!root || !relativePath) return t("common.unselected");
  return `${root.replace(/[\\/]+$/, "")}\\${relativePath.replace(/\//g, "\\")}`;
};

export interface RuntimeModelSettingsSectionProps {
  menuStyle: CSSProperties;
  llamaRuntimeSettings: LlamaRuntimeSettings;
  llamaRuntimeProcessState: LlamaRuntimeProcessState;
  ggufModelSettings: GgufModelSettings;
  isLoadingLlamaRuntime: boolean;
  isLoadingGgufModels: boolean;
  isChangingLlamaRuntimeState: boolean;
  appUpdateStatusLabel: string;
  appUpdateButtonLabel: string;
  appUpdateButtonHint: string;
  appUpdateButtonDisabled: boolean;
  onLlamaRuntimeChange: (version: string) => void;
  onRefreshLlamaRuntime: () => void;
  onGgufModelChange: (modelId: string) => void;
  onRefreshGgufModels: () => void;
  onStartLlamaRuntime: () => void;
  onStopLlamaRuntime: () => void;
  onAppUpdateAction: () => void;
}

export const RuntimeModelSettingsSection = ({
  menuStyle,
  llamaRuntimeSettings,
  llamaRuntimeProcessState,
  ggufModelSettings,
  isLoadingLlamaRuntime,
  isLoadingGgufModels,
  isChangingLlamaRuntimeState,
  appUpdateStatusLabel,
  appUpdateButtonLabel,
  appUpdateButtonHint,
  appUpdateButtonDisabled,
  onLlamaRuntimeChange,
  onRefreshLlamaRuntime,
  onGgufModelChange,
  onRefreshGgufModels,
  onStartLlamaRuntime,
  onStopLlamaRuntime,
  onAppUpdateAction
}: RuntimeModelSettingsSectionProps) => {
  const detailsCollapseTimerRef = useRef<number | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [detailsClosing, setDetailsClosing] = useState(false);
  const selectedGgufModel = ggufModelSettings.models.find((model) => model.id === ggufModelSettings.selectedModelId);
  const selectedLlamaRuntime = llamaRuntimeSettings.versions.find((runtime) => runtime.version === llamaRuntimeSettings.selectedVersion);
  const isLlamaRuntimeRunning = llamaRuntimeProcessState.status === "running";
  const isLlamaRuntimeStarting = llamaRuntimeProcessState.status === "starting";
  const llamaRuntimeActionDisabled = isChangingLlamaRuntimeState
    || isLlamaRuntimeStarting
    || (!isLlamaRuntimeRunning && (llamaRuntimeSettings.status !== "available" || ggufModelSettings.status !== "ready"));
  const runtimeErrorMessage = llamaRuntimeProcessState.status === "failed"
    ? llamaRuntimeProcessState.message
    : llamaRuntimeSettings.status === "missing_root"
      || llamaRuntimeSettings.status === "missing_server"
      || llamaRuntimeSettings.status === "selection_missing"
      ? llamaRuntimeSettings.message
      : "";
  const runtimeMessageIsFailure = llamaRuntimeProcessState.status === "failed";
  const runtimeIsMissing = llamaRuntimeSettings.status === "missing_root"
    || llamaRuntimeSettings.status === "missing_server"
    || llamaRuntimeSettings.status === "selection_missing";
  const runtimeHasMissingPrompt = runtimeIsMissing || Boolean(runtimeErrorMessage);
  const runtimeStatusLabel = runtimeHasMissingPrompt ? t("runtime.notFound") : getLlamaRuntimeProcessStatusLabel(llamaRuntimeProcessState);
  const modelErrorMessage = llamaRuntimeProcessState.selectedModelId === ggufModelSettings.selectedModelId
    && llamaRuntimeProcessState.modelStatus === "load_failed"
    ? llamaRuntimeProcessState.modelMessage
    : ggufModelSettings.status === "unpaired"
      || ggufModelSettings.status === "selection_missing"
      || ggufModelSettings.status === "missing_directory"
      ? ggufModelSettings.message
      : "";
  const modelMessageIsFailure = llamaRuntimeProcessState.selectedModelId === ggufModelSettings.selectedModelId
    && llamaRuntimeProcessState.modelStatus === "load_failed";
  const modelIsMissing = ggufModelSettings.status === "unpaired"
    || ggufModelSettings.status === "selection_missing"
    || ggufModelSettings.status === "missing_directory";
  const modelHasMissingPrompt = modelIsMissing || Boolean(modelErrorMessage);
  const modelStatusLabel = modelHasMissingPrompt ? t("model.notFound") : getGgufModelStatusLabel(ggufModelSettings, llamaRuntimeProcessState);

  const toggleRuntimeDetails = () => {
    if (detailsClosing) return;
    if (!detailsExpanded) {
      setDetailsExpanded(true);
      return;
    }

    setDetailsClosing(true);
    const collapseDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    detailsCollapseTimerRef.current = window.setTimeout(() => {
      setDetailsExpanded(false);
      setDetailsClosing(false);
      detailsCollapseTimerRef.current = null;
    }, collapseDuration);
  };

  useEffect(() => () => {
    if (detailsCollapseTimerRef.current !== null) {
      window.clearTimeout(detailsCollapseTimerRef.current);
    }
  }, []);

  return (
    <section className="cap-settings-group cap-settings-split cap-settings-group-runtime">
      <div className="cap-settings-row cap-settings-wide">
        <span className="cap-settings-label">llama.cpp</span>
        <span className="cap-settings-value">{runtimeStatusLabel}</span>
        <button className="cap-settings-pill" type="button" onClick={isLlamaRuntimeRunning ? onStopLlamaRuntime : onStartLlamaRuntime} title={isLlamaRuntimeRunning ? t("settings.stopServerActionHint") : t("settings.startServerActionHint")} disabled={llamaRuntimeActionDisabled}>
          {isLlamaRuntimeStarting ? t("common.starting") : isLlamaRuntimeRunning ? t("common.stop") : t("common.start")}
        </button>
        <SettingsSelect
          className="cap-settings-select-runtime"
          value={llamaRuntimeSettings.selectedVersion}
          disabled={isLoadingLlamaRuntime || isChangingLlamaRuntimeState || llamaRuntimeSettings.versions.length === 0 || llamaRuntimeProcessState.status === "starting" || llamaRuntimeProcessState.status === "running"}
          ariaLabel={t("settings.selectRuntime")}
          title={t("settings.selectRuntimeActionHint")}
          menuStyle={menuStyle}
          options={[
            { value: "", label: t("settings.selectVersion") },
            ...llamaRuntimeSettings.versions.map((runtime) => ({
              value: runtime.version,
              label: runtime.version
            }))
          ]}
          onChange={onLlamaRuntimeChange}
        />
        <button className="cap-settings-pill" type="button" onClick={onRefreshLlamaRuntime} title={t("settings.refreshRuntimeActionHint")} disabled={isLoadingLlamaRuntime}>
          {t("common.refresh")}
        </button>
      </div>
      {runtimeErrorMessage && !runtimeHasMissingPrompt && <div className={`cap-settings-message cap-settings-wide${runtimeMessageIsFailure ? " is-error" : ""}`}>{runtimeErrorMessage}</div>}

      <div className="cap-settings-row cap-settings-wide">
        <span className="cap-settings-label">{t("settings.visionModel")}</span>
        <span className="cap-settings-value">{modelStatusLabel}</span>
        <SettingsSelect
          className="cap-settings-select-model"
          value={ggufModelSettings.selectedModelId}
          disabled={isLoadingGgufModels || isChangingLlamaRuntimeState || ggufModelSettings.models.length === 0 || llamaRuntimeProcessState.status === "starting" || llamaRuntimeProcessState.status === "running"}
          ariaLabel={t("settings.selectVisionModel")}
          title={t("settings.selectVisionModelActionHint")}
          menuStyle={menuStyle}
          options={[
            { value: "", label: t("settings.selectVisionModel") },
            ...ggufModelSettings.models.map((model) => ({
              value: model.id,
              label: model.name
            }))
          ]}
          onChange={onGgufModelChange}
        />
        <button className="cap-settings-pill" type="button" onClick={onRefreshGgufModels} title={t("settings.refreshGgufActionHint")} disabled={isLoadingGgufModels || llamaRuntimeProcessState.status === "starting"}>
          {isLoadingGgufModels ? t("common.refreshing") : t("common.refresh")}
        </button>
      </div>
      {modelErrorMessage && !modelHasMissingPrompt && <div className={`cap-settings-message cap-settings-wide${modelMessageIsFailure ? " is-error" : ""}`}>{modelErrorMessage}</div>}

      <div className="cap-settings-row">
        <span className="cap-settings-label">{t("settings.versionUpdate")}</span>
        <span className="cap-settings-value">{appUpdateStatusLabel}</span>
        <button
          className="cap-settings-pill"
          type="button"
          onClick={onAppUpdateAction}
          title={appUpdateButtonHint}
          disabled={appUpdateButtonDisabled}
        >
          {appUpdateButtonLabel}
        </button>
      </div>

      <details className="cap-settings-details cap-settings-row cap-settings-wide" open={detailsExpanded}>
        <summary
          aria-expanded={detailsExpanded}
          title={detailsExpanded ? t("settings.collapseDetailsHint") : t("settings.expandDetailsHint")}
          onClick={(event) => {
            event.preventDefault();
            toggleRuntimeDetails();
          }}
        >
          {t("settings.details")}
        </summary>
        {detailsExpanded && (
          <div className={`cap-settings-expandable-shell${detailsClosing ? " is-closing" : ""}`}>
            <div className="cap-settings-expandable-inner">
              <div className="ai-details-grid">
                <RuntimeDiagnosticsRows />
                <span>{t("settings.runtimeFileStatus")}</span>
                <strong>{getLlamaRuntimeStatusLabel(llamaRuntimeSettings)}</strong>
                <span>{t("settings.runtimeDirectory")}</span>
                <strong title={llamaRuntimeSettings.runtimeRoot}>{llamaRuntimeSettings.runtimeRoot || t("common.notDetected")}</strong>
                <span>llama-server</span>
                <strong title={selectedLlamaRuntime?.serverPath}>{selectedLlamaRuntime?.serverPath || t("common.unselected")}</strong>
                {isLlamaRuntimeRunning && llamaRuntimeProcessState.port !== null && (
                  <>
                    <span>{t("settings.serviceAddress")}</span>
                    <strong>{`http://${llamaRuntimeProcessState.host}:${llamaRuntimeProcessState.port}`}</strong>
                    <span>{t("settings.processPid")}</span>
                    <strong>{llamaRuntimeProcessState.pid ?? t("common.unknown")}</strong>
                    <span>{t("settings.runtimeStartedAt")}</span>
                    <strong>
                      {llamaRuntimeProcessState.startedAt
                        ? new Date(llamaRuntimeProcessState.startedAt).toLocaleString()
                        : t("common.unknown")}
                    </strong>
                  </>
                )}
                <span>{t("settings.runtimeLog")}</span>
                <strong title={llamaRuntimeProcessState.logPath}>{llamaRuntimeProcessState.logPath || t("common.notCreated")}</strong>
                <span>{t("settings.modelDirectory")}</span>
                <strong title={ggufModelSettings.modelsRoot}>{ggufModelSettings.modelsRoot || t("common.notDetected")}</strong>
                <span>{t("settings.modelPath")}</span>
                <strong title={joinDisplayPath(ggufModelSettings.modelsRoot, selectedGgufModel?.modelFile.relativePath)}>
                  {joinDisplayPath(ggufModelSettings.modelsRoot, selectedGgufModel?.modelFile.relativePath)}
                </strong>
                <span>{t("settings.mmprojFile")}</span>
                <strong title={joinDisplayPath(ggufModelSettings.modelsRoot, selectedGgufModel?.mmprojFile?.relativePath)}>
                  {joinDisplayPath(ggufModelSettings.modelsRoot, selectedGgufModel?.mmprojFile?.relativePath)}
                </strong>
                <span>{t("settings.mainModelInfo")}</span>
                <strong>
                  {selectedGgufModel
                    ? `${formatCacheSize(selectedGgufModel.modelFile.size)} / ${new Date(selectedGgufModel.modelFile.modifiedAt).toLocaleString()}`
                    : t("common.unselected")}
                </strong>
                <span>{t("settings.mmprojInfo")}</span>
                <strong>
                  {selectedGgufModel?.mmprojFile
                    ? `${formatCacheSize(selectedGgufModel.mmprojFile.size)} / ${new Date(selectedGgufModel.mmprojFile.modifiedAt).toLocaleString()}`
                    : t("common.unselected")}
                </strong>
                <span>{t("settings.modelInventory")}</span>
                <strong>{`${ggufModelSettings.models.filter((model) => model.loadable).length} / ${ggufModelSettings.files.length}`}</strong>
              </div>
            </div>
          </div>
        )}
      </details>
    </section>
  );
};
