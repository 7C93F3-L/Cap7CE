import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { t } from "../../../electron/localization";
import type {
  AiIndexProgress,
  AppearanceColors,
  DirectoryItem,
  GgufModelSettings,
  IndexQualityStats,
  LanguagePreference,
  LlamaRuntimeProcessState,
  LlamaRuntimeSettings,
  RecognitionStatusFilter,
  SearchState,
  ShortcutActionId,
  ShortcutActionPreferences,
  ShortcutActionsUpdateResult,
  ShortcutAvailabilityResult,
  SkimDisplayPreferences,
  ThumbnailOptimizationStatus,
  VisualCacheStats,
  ThemeMode
} from "../../shared/types";
import { formatCacheSize } from "../formatting";
import {
  Cap7CESearchCapsule,
  standardSearchLabelGroups,
  type SearchCapsuleLabelVisibility
} from "../search/Cap7CESearchCapsule";
import CustomScrollbar from "../CustomScrollbar";
import { AppearanceSettingsSections } from "./AppearanceSettingsSections";
import { CacheSettingsRows } from "./CacheSettingsRows";
import { DirectoryAiSettingsRows } from "./DirectoryAiSettingsRows";
import { QuickActionSettingsRows } from "./QuickActionSettingsRows";
import { QuickCommandSettingsRows } from "./QuickCommandSettingsRows";
import { RuntimeModelSettingsSection } from "./RuntimeModelSettingsSection";
import { SettingsFooter } from "./SettingsFooter";
import { SkimDisplaySettingsRows } from "./SkimDisplaySettingsRows";

export type ScanSummary = {
  imageCount: number;
  scanResultPath: string;
  aiCompleted: number;
  aiFailed: number;
  aiTotal: number;
};

export interface SettingsViewProps {
  search: SearchState;
  quickCommandNotice: string;
  inputFeedbackIsGuide: boolean;
  searchInputRef: Ref<HTMLInputElement>;
  directoryName: string;
  status: ReactNode;
  searchDirectories: DirectoryItem[];
  labelVisibility: SearchCapsuleLabelVisibility;
  theme: ThemeMode;
  menuStyle: CSSProperties;
  languagePreference: LanguagePreference;
  appearanceColors: AppearanceColors;
  edgeSnapEnabled: boolean;
  standbyLineVisible: boolean;
  launchAtLogin: boolean;
  systemNotificationsEnabled: boolean;
  operationHintsEnabled: boolean;
  quickActionGlobalEnabled: boolean;
  shortcutActions: ShortcutActionPreferences;
  unavailableShortcutActionIds: ShortcutActionId[];
  quickActionsExpanded: boolean;
  quickCommandsExpanded: boolean;
  skimDisplay: SkimDisplayPreferences;
  directories: DirectoryItem[];
  isLoadingDirectories: boolean;
  isAddingDirectory: boolean;
  directoryServiceUnavailable: boolean;
  isScanning: boolean;
  isCancellingRecognition: boolean;
  aiProgress: AiIndexProgress | null;
  scanSummary: ScanSummary | null;
  scanError: string;
  indexStats: IndexQualityStats;
  llamaRuntimeSettings: LlamaRuntimeSettings;
  llamaRuntimeProcessState: LlamaRuntimeProcessState;
  ggufModelSettings: GgufModelSettings;
  isLoadingLlamaRuntime: boolean;
  isLoadingGgufModels: boolean;
  isChangingLlamaRuntimeState: boolean;
  visualCacheStats: VisualCacheStats;
  skimCacheStats: VisualCacheStats;
  thumbnailOptimizationStatus: ThumbnailOptimizationStatus;
  isLoadingCacheStats: boolean;
  isClearingCache: boolean;
  isClearingSkimCache: boolean;
  cacheInlineFeedback: string;
  skimCacheInlineFeedback: string;
  editingDirectoryId: string | null;
  onSearchChange: (search: SearchState) => void;
  onLabelVisibilityChange: (visibility: SearchCapsuleLabelVisibility) => void;
  onSearchOptionsChange: (search: SearchState) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onLanguageChange: (language: LanguagePreference) => void;
  onAppearanceColorsPreview: (appearanceColors: AppearanceColors) => void;
  onAppearanceColorsChange: (appearanceColors: AppearanceColors) => void;
  onEdgeSnapChange: (edgeSnapEnabled: boolean) => void;
  onStandbyLineVisibleChange: (standbyLineVisible: boolean) => void;
  onLaunchAtLoginChange: (launchAtLogin: boolean) => void;
  onSystemNotificationsChange: (enabled: boolean) => void;
  onOperationHintsChange: (enabled: boolean) => void;
  onAutoCacheOptimizationChange: (enabled: boolean) => void;
  onQuickActionGlobalEnabledChange: (quickActionGlobalEnabled: boolean) => void;
  onShortcutActionsChange: (shortcutActions: ShortcutActionPreferences) => Promise<ShortcutActionsUpdateResult | null>;
  onShortcutCaptureStart: () => Promise<boolean>;
  onShortcutCaptureEnd: () => Promise<ShortcutAvailabilityResult>;
  onQuickActionsExpandedChange: (expanded: boolean) => void;
  onQuickCommandsExpandedChange: (expanded: boolean) => void;
  onSkimDisplayChange: (skimDisplay: SkimDisplayPreferences) => void;
  onSearch: () => void;
  onStartAdd: () => void;
  onUpdateAll: () => void;
  onRecognizeDirectory: (directoryId: string) => void;
  onContinueRecognition: () => void;
  onCancelRecognition: () => void;
  onRetryIndex: () => void;
  onLlamaRuntimeChange: (version: string) => void;
  onRefreshLlamaRuntime: () => void;
  onGgufModelChange: (modelId: string) => void;
  onRefreshGgufModels: () => void;
  onStartLlamaRuntime: () => void;
  onStopLlamaRuntime: () => void;
  onClearCache: () => void;
  onClearSkimCache: () => void;
  onOpenIndexView: (recognitionStatus: RecognitionStatusFilter) => void;
  onEditDirectory: (id: string) => void;
  onCancelDirectoryEdit: () => void;
  onDirectoryNameChange: (id: string, name: string) => void;
  onDeleteDirectory: (id: string) => void;
}

export const SettingsView = ({ search, quickCommandNotice, inputFeedbackIsGuide, searchInputRef, directoryName, status, searchDirectories, labelVisibility, theme, menuStyle, languagePreference, appearanceColors, edgeSnapEnabled, standbyLineVisible, launchAtLogin, systemNotificationsEnabled, operationHintsEnabled, quickActionGlobalEnabled, shortcutActions, unavailableShortcutActionIds, quickActionsExpanded, quickCommandsExpanded, skimDisplay, directories, isLoadingDirectories, isAddingDirectory, directoryServiceUnavailable, isScanning, isCancellingRecognition, aiProgress, scanSummary, scanError, indexStats, llamaRuntimeSettings, llamaRuntimeProcessState, ggufModelSettings, isLoadingLlamaRuntime, isLoadingGgufModels, isChangingLlamaRuntimeState, visualCacheStats, skimCacheStats, thumbnailOptimizationStatus, isLoadingCacheStats, isClearingCache, isClearingSkimCache, cacheInlineFeedback, skimCacheInlineFeedback, editingDirectoryId, onSearchChange, onLabelVisibilityChange, onSearchOptionsChange, onThemeChange, onLanguageChange, onAppearanceColorsPreview, onAppearanceColorsChange, onEdgeSnapChange, onStandbyLineVisibleChange, onLaunchAtLoginChange, onSystemNotificationsChange, onOperationHintsChange, onAutoCacheOptimizationChange, onQuickActionGlobalEnabledChange, onShortcutActionsChange, onShortcutCaptureStart, onShortcutCaptureEnd, onQuickActionsExpandedChange, onQuickCommandsExpandedChange, onSkimDisplayChange, onSearch, onStartAdd, onUpdateAll, onRecognizeDirectory, onContinueRecognition, onCancelRecognition, onRetryIndex, onLlamaRuntimeChange, onRefreshLlamaRuntime, onGgufModelChange, onRefreshGgufModels, onStartLlamaRuntime, onStopLlamaRuntime, onClearCache, onClearSkimCache, onOpenIndexView, onEditDirectory, onCancelDirectoryEdit, onDirectoryNameChange, onDeleteDirectory }: SettingsViewProps) => {
  const [selectedIndexStat, setSelectedIndexStat] = useState<RecognitionStatusFilter | null>(null);
  const settingsScrollRef = useRef<HTMLDivElement | null>(null);
  const [appUpdateStatus, setAppUpdateStatus] = useState<"idle" | "checking" | "up_to_date" | "update_available" | "downloading" | "cancelling" | "cancelled" | "installing" | "unsupported" | "failed" | "download_failed">("idle");
  const [appUpdateFailureReason, setAppUpdateFailureReason] = useState<"rate_limited" | "network" | "disk_space" | "security" | "incomplete" | "invalid" | "unknown" | null>(null);
  const [appUpdateVersion, setAppUpdateVersion] = useState("");
  const [appUpdateProgress, setAppUpdateProgress] = useState<{ receivedBytes: number; totalBytes: number | null; percent: number | null; completed?: boolean } | null>(null);
  const cacheStatusValues = {
    count: visualCacheStats.cacheCount,
    size: formatCacheSize(visualCacheStats.totalBytes),
    processed: thumbnailOptimizationStatus.processedCount,
    remaining: thumbnailOptimizationStatus.queuedCount
  };
  const cacheOptimizationStatusLabel = cacheInlineFeedback
    || (isLoadingCacheStats
      ? t("settings.readingCache")
      : thumbnailOptimizationStatus.phase === "running"
        ? t("settings.cacheOptimizationRunning", cacheStatusValues)
        : thumbnailOptimizationStatus.phase === "completed"
          ? t("settings.cacheOptimizationCompleted", cacheStatusValues)
          : thumbnailOptimizationStatus.enabled
            ? t("settings.cacheOptimizationReady", cacheStatusValues)
            : t("settings.cacheOptimizationDisabled", cacheStatusValues));
  const appUpdateStatusLabel = appUpdateStatus === "checking"
    ? t("settings.updateChecking")
    : appUpdateStatus === "up_to_date"
      ? t("settings.updateUpToDate", { version: appUpdateVersion })
      : appUpdateStatus === "update_available"
        ? t("settings.updateAvailable", { version: appUpdateVersion })
        : appUpdateStatus === "downloading"
          ? appUpdateProgress?.totalBytes
            ? t("settings.updateDownloading", {
              percent: appUpdateProgress?.percent === null || appUpdateProgress?.percent === undefined ? "--" : String(appUpdateProgress.percent),
              received: formatCacheSize(appUpdateProgress?.receivedBytes ?? 0),
              total: formatCacheSize(appUpdateProgress.totalBytes)
            })
            : t("settings.updateDownloadingUnknownTotal", { received: formatCacheSize(appUpdateProgress?.receivedBytes ?? 0) })
          : appUpdateStatus === "cancelling"
            ? t("settings.updateCancelling")
          : appUpdateStatus === "cancelled"
            ? t("settings.updateCancelled")
          : appUpdateStatus === "installing"
            ? t("settings.updateInstalling")
            : appUpdateStatus === "unsupported"
              ? t("settings.updateUnsupported")
          : appUpdateStatus === "download_failed"
            ? t(appUpdateFailureReason === "rate_limited"
              ? "settings.updateRateLimited"
              : appUpdateFailureReason === "network"
                ? "settings.updateNetworkFailed"
                : appUpdateFailureReason === "disk_space"
                  ? "settings.updateDiskSpaceFailed"
                : appUpdateFailureReason === "security"
                  ? "settings.updateSecurityFailed"
                  : appUpdateFailureReason === "incomplete"
                    ? "settings.updateIncomplete"
                    : appUpdateFailureReason === "invalid"
                      ? "settings.updateInvalid"
                      : "settings.updateDownloadFailed")
            : appUpdateStatus === "failed"
              ? t("settings.updateCheckFailed")
              : t("settings.updateNotChecked");
  const appUpdateButtonLabel = appUpdateStatus === "checking"
    ? t("settings.updateCheckingButton")
    : appUpdateStatus === "downloading"
      ? t("common.cancel")
      : appUpdateStatus === "cancelling"
        ? t("settings.updateCancellingButton")
      : appUpdateStatus === "installing"
        ? t("settings.updateInstallingButton")
      : appUpdateStatus === "update_available" || appUpdateStatus === "download_failed" || appUpdateStatus === "cancelled" || appUpdateStatus === "unsupported"
        ? t("settings.downloadUpdateNow")
        : t("settings.checkForUpdates");
  const appUpdateButtonHint = appUpdateStatus === "downloading"
    ? t("settings.cancelUpdateDownloadHint")
    : appUpdateStatus === "update_available"
    || appUpdateStatus === "cancelling"
    || appUpdateStatus === "installing"
    || appUpdateStatus === "download_failed"
    || appUpdateStatus === "cancelled"
    || appUpdateStatus === "unsupported"
    ? t("settings.downloadUpdateActionHint")
    : t("settings.checkForUpdatesActionHint");

  useEffect(() => window.imageEverything?.app.onUpdateDownloadProgress((progress) => {
    setAppUpdateProgress(progress);
    setAppUpdateStatus(progress.completed ? "installing" : "downloading");
  }), []);

  const handleAppUpdateAction = async () => {
    if (appUpdateStatus === "downloading") {
      setAppUpdateStatus("cancelling");
      const cancelled = await window.imageEverything?.app.cancelUpdateDownload();
      if (!cancelled) setAppUpdateStatus("downloading");
      return;
    }
    if (appUpdateStatus === "checking" || appUpdateStatus === "cancelling" || appUpdateStatus === "installing") return;
    if (appUpdateStatus === "update_available" || appUpdateStatus === "download_failed" || appUpdateStatus === "cancelled" || appUpdateStatus === "unsupported") {
      setAppUpdateProgress(null);
      setAppUpdateFailureReason(null);
      setAppUpdateStatus("downloading");
      try {
        const result = await window.imageEverything?.app.downloadUpdate();
        if (result?.status === "failed") {
          setAppUpdateFailureReason(result.reason === "cancelled" ? null : result.reason ?? "unknown");
        }
        setAppUpdateStatus(result?.status === "installing"
          ? "installing"
          : result?.status === "cancelled"
            ? "cancelled"
          : result?.status === "unsupported"
            ? "unsupported"
            : result?.status === "busy"
              ? "downloading"
              : "download_failed");
      } catch {
        setAppUpdateFailureReason("unknown");
        setAppUpdateStatus("download_failed");
      }
      return;
    }

    setAppUpdateStatus("checking");
    setAppUpdateFailureReason(null);
    try {
      const result = await window.imageEverything?.app.checkForUpdates();
      if (!result) {
        setAppUpdateStatus("failed");
        return;
      }
      setAppUpdateVersion(result.latestVersion || result.currentVersion);
      setAppUpdateStatus(result.status);
    } catch {
      setAppUpdateStatus("failed");
    }
  };

  return (
    <>
    <main className="settings-view cap-settings-view" data-settings-view="true" onClick={() => setSelectedIndexStat(null)}>
      <Cap7CESearchCapsule
        search={search}
        directoryName={directoryName}
        directories={searchDirectories}
        labelVisibility={labelVisibility}
        status={status}
        inputFeedback={quickCommandNotice}
        inputFeedbackIsGuide={inputFeedbackIsGuide}
        inputRef={searchInputRef}
        unified
        skimDisplayMode={skimDisplay.searchMode}
        enabledLabelGroups={standardSearchLabelGroups}
        onSearchChange={onSearchChange}
        onLabelVisibilityChange={onLabelVisibilityChange}
        onSkimDisplayModeChange={(searchMode) => onSkimDisplayChange({ ...skimDisplay, searchMode })}
        onSearchOptionsChange={onSearchOptionsChange}
        onSearch={onSearch}
      />

      <div className="cap-settings-scroll-frame cap-scroll-viewport-frame cap-scroll-viewport-frame-vertical">
        <div className="cap-settings-stage cap-main-scroll-viewport" ref={settingsScrollRef}>
          <div className="cap-settings-stack">
        <div className="cap-settings-title">Set: Cap7CE</div>
        <section className="cap-settings-group cap-settings-group-source">

          <DirectoryAiSettingsRows
            selectedIndexStat={selectedIndexStat}
            directories={directories}
            isLoadingDirectories={isLoadingDirectories}
            isAddingDirectory={isAddingDirectory}
            directoryServiceUnavailable={directoryServiceUnavailable}
            isScanning={isScanning}
            isCancellingRecognition={isCancellingRecognition}
            aiProgress={aiProgress}
            scanSummary={scanSummary}
            scanError={scanError}
            indexStats={indexStats}
            editingDirectoryId={editingDirectoryId}
            onSelectedIndexStatChange={setSelectedIndexStat}
            onStartAdd={onStartAdd}
            onUpdateAll={onUpdateAll}
            onRecognizeDirectory={onRecognizeDirectory}
            onContinueRecognition={onContinueRecognition}
            onCancelRecognition={onCancelRecognition}
            onRetryIndex={onRetryIndex}
            onOpenIndexView={onOpenIndexView}
            onEditDirectory={onEditDirectory}
            onCancelDirectoryEdit={onCancelDirectoryEdit}
            onDirectoryNameChange={onDirectoryNameChange}
            onDeleteDirectory={onDeleteDirectory}
          />
          <CacheSettingsRows
            cacheOptimizationStatusLabel={cacheOptimizationStatusLabel}
            thumbnailOptimizationStatus={thumbnailOptimizationStatus}
            visualCacheStats={visualCacheStats}
            skimCacheStats={skimCacheStats}
            isLoadingCacheStats={isLoadingCacheStats}
            isClearingCache={isClearingCache}
            isClearingSkimCache={isClearingSkimCache}
            skimCacheInlineFeedback={skimCacheInlineFeedback}
            onAutoCacheOptimizationChange={onAutoCacheOptimizationChange}
            onClearCache={onClearCache}
            onClearSkimCache={onClearSkimCache}
          />
        </section>


        <AppearanceSettingsSections
          theme={theme}
          languagePreference={languagePreference}
          appearanceColors={appearanceColors}
          menuStyle={menuStyle}
          edgeSnapEnabled={edgeSnapEnabled}
          standbyLineVisible={standbyLineVisible}
          launchAtLogin={launchAtLogin}
          systemNotificationsEnabled={systemNotificationsEnabled}
          operationHintsEnabled={operationHintsEnabled}
          onThemeChange={onThemeChange}
          onLanguageChange={onLanguageChange}
          onAppearanceColorsPreview={onAppearanceColorsPreview}
          onAppearanceColorsChange={onAppearanceColorsChange}
          onEdgeSnapChange={onEdgeSnapChange}
          onStandbyLineVisibleChange={onStandbyLineVisibleChange}
          onLaunchAtLoginChange={onLaunchAtLoginChange}
          onSystemNotificationsChange={onSystemNotificationsChange}
          onOperationHintsChange={onOperationHintsChange}
        />

        <section className="cap-settings-group cap-settings-split cap-settings-group-actions">
          <SkimDisplaySettingsRows
            skimDisplay={skimDisplay}
            onSkimDisplayChange={onSkimDisplayChange}
          />
          <QuickActionSettingsRows
            quickActionGlobalEnabled={quickActionGlobalEnabled}
            shortcutActions={shortcutActions}
            unavailableShortcutActionIds={unavailableShortcutActionIds}
            expanded={quickActionsExpanded}
            onGlobalEnabledChange={onQuickActionGlobalEnabledChange}
            onShortcutActionsChange={onShortcutActionsChange}
            onShortcutCaptureStart={onShortcutCaptureStart}
            onShortcutCaptureEnd={onShortcutCaptureEnd}
            onExpandedChange={onQuickActionsExpandedChange}
          />
          <QuickCommandSettingsRows
            expanded={quickCommandsExpanded}
            onExpandedChange={onQuickCommandsExpandedChange}
          />
        </section>

        <RuntimeModelSettingsSection
          menuStyle={menuStyle}
          llamaRuntimeSettings={llamaRuntimeSettings}
          llamaRuntimeProcessState={llamaRuntimeProcessState}
          ggufModelSettings={ggufModelSettings}
          isLoadingLlamaRuntime={isLoadingLlamaRuntime}
          isLoadingGgufModels={isLoadingGgufModels}
          isChangingLlamaRuntimeState={isChangingLlamaRuntimeState}
          appUpdateStatusLabel={appUpdateStatusLabel}
          appUpdateButtonLabel={appUpdateButtonLabel}
          appUpdateButtonHint={appUpdateButtonHint}
          appUpdateButtonDisabled={appUpdateStatus === "checking" || appUpdateStatus === "cancelling" || appUpdateStatus === "installing"}
          onLlamaRuntimeChange={onLlamaRuntimeChange}
          onRefreshLlamaRuntime={onRefreshLlamaRuntime}
          onGgufModelChange={onGgufModelChange}
          onRefreshGgufModels={onRefreshGgufModels}
          onStartLlamaRuntime={onStartLlamaRuntime}
          onStopLlamaRuntime={onStopLlamaRuntime}
          onAppUpdateAction={() => void handleAppUpdateAction()}
        />

        <SettingsFooter />
          </div>
        </div>
        <CustomScrollbar scrollContainerRef={settingsScrollRef} orientation="vertical" />
      </div>
    </main>
    </>
  );
};
