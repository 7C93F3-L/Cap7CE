import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { t } from "../../../electron/localization";
import type {
  AppearanceColors,
  DirectoryItem,
  GgufModelSettings,
  LanguagePreference,
  LlamaRuntimeProcessState,
  LlamaRuntimeSettings,
  SearchState,
  ShortcutActionId,
  ShortcutActionPreferences,
  ShortcutActionsUpdateResult,
  ShortcutAvailabilityResult,
  SkimDisplayPreferences,
  ThumbnailOptimizationStatus,
  VisualCacheStats,
  ThemeMode,
  WindowPresentationMode
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
import { EmbeddedMetadataSettingsRow } from "./EmbeddedMetadataSettingsRow";
import { DirectoryAiSettingsRows } from "./DirectoryAiSettingsRows";
import { QuickActionSettingsRows } from "./QuickActionSettingsRows";
import { QuickCommandSettingsRows } from "./QuickCommandSettingsRows";
import { RuntimeModelSettingsSection } from "./RuntimeModelSettingsSection";
import { SettingsFooter } from "./SettingsFooter";
import { SkimDisplaySettingsRows } from "./SkimDisplaySettingsRows";
import { useWindowLayoutPreference } from "./useWindowLayoutPreference";

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
  standbyLineVisible: boolean;
  launchAtLogin: boolean;
  windowPresentationMode: WindowPresentationMode;
  systemNotificationsEnabled: boolean;
  operationHintsEnabled: boolean;
  aiRecognitionEnabled: boolean;
  aiSearchEnabled: boolean;
  aiSearchBusy: boolean;
  quickActionGlobalEnabled: boolean;
  shortcutActions: ShortcutActionPreferences;
  unavailableShortcutActionIds: ShortcutActionId[];
  quickActionsExpanded: boolean;
  quickCommandsExpanded: boolean;
  skimDisplay: SkimDisplayPreferences;
  directories: DirectoryItem[];
  totalFileCount: number | null;
  isLoadingDirectories: boolean;
  isAddingDirectory: boolean;
  directoryServiceUnavailable: boolean;
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
  onStandbyLineVisibleChange: (standbyLineVisible: boolean) => void;
  onLaunchAtLoginChange: (launchAtLogin: boolean) => void;
  onSystemNotificationsChange: (enabled: boolean) => void;
  onOperationHintsChange: (enabled: boolean) => void;
  onAutoCacheOptimizationChange: (enabled: boolean) => void;
  onAiRecognitionEnabledChange: (enabled: boolean) => void;
  onAiSearchToggle: () => void;
  onQuickActionGlobalEnabledChange: (quickActionGlobalEnabled: boolean) => void;
  onShortcutActionsChange: (shortcutActions: ShortcutActionPreferences) => Promise<ShortcutActionsUpdateResult | null>;
  onShortcutCaptureStart: () => Promise<boolean>;
  onShortcutCaptureEnd: () => Promise<ShortcutAvailabilityResult>;
  onQuickActionsExpandedChange: (expanded: boolean) => void;
  onQuickCommandsExpandedChange: (expanded: boolean) => void;
  onSkimDisplayChange: (skimDisplay: SkimDisplayPreferences) => void;
  onSearch: () => void;
  onStartAdd: () => void;
  onLlamaRuntimeChange: (version: string) => void;
  onRefreshLlamaRuntime: () => void;
  onGgufModelChange: (modelId: string) => void;
  onRefreshGgufModels: () => void;
  onStartLlamaRuntime: () => void;
  onStopLlamaRuntime: () => void;
  onClearCache: () => void;
  onClearSkimCache: () => void;
  onEditDirectory: (id: string) => void;
  onCancelDirectoryEdit: () => void;
  onDirectoryNameChange: (id: string, name: string) => void;
  onDeleteDirectory: (id: string) => void;
}

export const SettingsView = ({ search, quickCommandNotice, inputFeedbackIsGuide, searchInputRef, directoryName, status, searchDirectories, labelVisibility, theme, menuStyle, languagePreference, appearanceColors, standbyLineVisible, launchAtLogin, windowPresentationMode, systemNotificationsEnabled, operationHintsEnabled, aiRecognitionEnabled, aiSearchEnabled, aiSearchBusy, quickActionGlobalEnabled, shortcutActions, unavailableShortcutActionIds, quickActionsExpanded, quickCommandsExpanded, skimDisplay, directories, totalFileCount, isLoadingDirectories, isAddingDirectory, directoryServiceUnavailable, llamaRuntimeSettings, llamaRuntimeProcessState, ggufModelSettings, isLoadingLlamaRuntime, isLoadingGgufModels, isChangingLlamaRuntimeState, visualCacheStats, skimCacheStats, thumbnailOptimizationStatus, isLoadingCacheStats, isClearingCache, isClearingSkimCache, cacheInlineFeedback, skimCacheInlineFeedback, editingDirectoryId, onSearchChange, onLabelVisibilityChange, onSearchOptionsChange, onThemeChange, onLanguageChange, onAppearanceColorsPreview, onAppearanceColorsChange, onStandbyLineVisibleChange, onLaunchAtLoginChange, onSystemNotificationsChange, onOperationHintsChange, onAutoCacheOptimizationChange, onAiRecognitionEnabledChange, onAiSearchToggle, onQuickActionGlobalEnabledChange, onShortcutActionsChange, onShortcutCaptureStart, onShortcutCaptureEnd, onQuickActionsExpandedChange, onQuickCommandsExpandedChange, onSkimDisplayChange, onSearch, onStartAdd, onLlamaRuntimeChange, onRefreshLlamaRuntime, onGgufModelChange, onRefreshGgufModels, onStartLlamaRuntime, onStopLlamaRuntime, onClearCache, onClearSkimCache, onEditDirectory, onCancelDirectoryEdit, onDirectoryNameChange, onDeleteDirectory }: SettingsViewProps) => {
  const windowLayoutPreference = useWindowLayoutPreference();
  useEffect(() => windowLayoutPreference.load(), []);
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

  useEffect(() => window.cap7ce?.app.onUpdateDownloadProgress((progress) => {
    setAppUpdateProgress(progress);
    setAppUpdateStatus(progress.completed ? "installing" : "downloading");
  }), []);

  const handleAppUpdateAction = async () => {
    if (appUpdateStatus === "downloading") {
      setAppUpdateStatus("cancelling");
      const cancelled = await window.cap7ce?.app.cancelUpdateDownload();
      if (!cancelled) setAppUpdateStatus("downloading");
      return;
    }
    if (appUpdateStatus === "checking" || appUpdateStatus === "cancelling" || appUpdateStatus === "installing") return;
    if (appUpdateStatus === "update_available" || appUpdateStatus === "download_failed" || appUpdateStatus === "cancelled" || appUpdateStatus === "unsupported") {
      setAppUpdateProgress(null);
      setAppUpdateFailureReason(null);
      setAppUpdateStatus("downloading");
      try {
        const result = await window.cap7ce?.app.downloadUpdate();
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
      const result = await window.cap7ce?.app.checkForUpdates();
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
    <main className="settings-view cap-settings-view" data-settings-view="true">
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
        aiSearchEnabled={aiSearchEnabled}
        aiSearchBusy={aiSearchBusy}
        onSearchChange={onSearchChange}
        onLabelVisibilityChange={onLabelVisibilityChange}
        onSkimDisplayModeChange={(searchMode) => onSkimDisplayChange({ ...skimDisplay, searchMode })}
        onSearchOptionsChange={onSearchOptionsChange}
        onSearch={onSearch}
        onAiSearchToggle={onAiSearchToggle}
      />

      <div className="cap-settings-scroll-frame cap-scroll-viewport-frame cap-scroll-viewport-frame-vertical">
        <div className="cap-settings-stage cap-main-scroll-viewport" ref={settingsScrollRef}>
          <div className="cap-settings-stack">
        <div className="cap-settings-title">Set: Cap7CE</div>
        <section className="cap-settings-group cap-settings-group-source">

          <DirectoryAiSettingsRows
            directories={directories}
            totalFileCount={totalFileCount}
            isLoadingDirectories={isLoadingDirectories}
            isAddingDirectory={isAddingDirectory}
            directoryServiceUnavailable={directoryServiceUnavailable}
            aiRecognitionEnabled={aiRecognitionEnabled}
            editingDirectoryId={editingDirectoryId}
            onStartAdd={onStartAdd}
            onAiRecognitionEnabledChange={onAiRecognitionEnabledChange}
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
          <EmbeddedMetadataSettingsRow />
        </section>


        <AppearanceSettingsSections
          theme={theme}
          languagePreference={languagePreference}
          appearanceColors={appearanceColors}
          menuStyle={menuStyle}
          edgeCollapseEnabled={windowLayoutPreference.edgeCollapseEnabled}
          rememberWindowLayout={windowLayoutPreference.rememberWindowLayout}
          standbyLineVisible={standbyLineVisible}
          launchAtLogin={launchAtLogin}
          windowPresentationMode={windowPresentationMode}
          systemNotificationsEnabled={systemNotificationsEnabled}
          operationHintsEnabled={operationHintsEnabled}
          onThemeChange={onThemeChange}
          onLanguageChange={onLanguageChange}
          onAppearanceColorsPreview={onAppearanceColorsPreview}
          onAppearanceColorsChange={onAppearanceColorsChange}
          onEdgeCollapseChange={windowLayoutPreference.updateEdgeCollapse}
          onRememberWindowLayoutChange={windowLayoutPreference.update}
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
