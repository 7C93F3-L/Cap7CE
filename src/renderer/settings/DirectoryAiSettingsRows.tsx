import { useEffect, useRef, useState } from "react";
import { t } from "../../../electron/localization";
import type {
  AiIndexProgress,
  DirectoryItem,
  IndexQualityStats,
  RecognitionStatusFilter
} from "../../shared/types";
import { formatDisplayMessage } from "../formatting";

type SettingsScanSummary = {
  aiCompleted: number;
  aiFailed: number;
  aiTotal: number;
};

export interface DirectoryAiSettingsRowsProps {
  selectedIndexStat: RecognitionStatusFilter | null;
  directories: DirectoryItem[];
  isLoadingDirectories: boolean;
  isAddingDirectory: boolean;
  directoryServiceUnavailable: boolean;
  isScanning: boolean;
  isCancellingRecognition: boolean;
  aiProgress: AiIndexProgress | null;
  scanSummary: SettingsScanSummary | null;
  scanError: string;
  indexStats: IndexQualityStats;
  editingDirectoryId: string | null;
  onSelectedIndexStatChange: (status: RecognitionStatusFilter | null) => void;
  onStartAdd: () => void;
  onUpdateAll: () => void;
  onRecognizeDirectory: (directoryId: string) => void;
  onContinueRecognition: () => void;
  onCancelRecognition: () => void;
  onRetryIndex: () => void;
  onOpenIndexView: (recognitionStatus: RecognitionStatusFilter) => void;
  onEditDirectory: (id: string) => void;
  onCancelDirectoryEdit: () => void;
  onDirectoryNameChange: (id: string, name: string) => void;
  onDeleteDirectory: (id: string) => void;
}

const getRecognitionStatusLabels = (): Record<RecognitionStatusFilter, string> => ({
  all: t("filter.allFiles"),
  recognized: t("filter.recognized"),
  unrecognized: t("filter.unrecognized")
});

export const DirectoryAiSettingsRows = ({
  selectedIndexStat,
  directories,
  isLoadingDirectories,
  isAddingDirectory,
  directoryServiceUnavailable,
  isScanning,
  isCancellingRecognition,
  aiProgress,
  scanSummary,
  scanError,
  indexStats,
  editingDirectoryId,
  onSelectedIndexStatChange,
  onStartAdd,
  onUpdateAll,
  onRecognizeDirectory,
  onContinueRecognition,
  onCancelRecognition,
  onRetryIndex,
  onOpenIndexView,
  onEditDirectory,
  onCancelDirectoryEdit,
  onDirectoryNameChange,
  onDeleteDirectory
}: DirectoryAiSettingsRowsProps) => {
  const [indexDetailsExpanded, setIndexDetailsExpanded] = useState(isScanning);
  const [indexDetailsClosing, setIndexDetailsClosing] = useState(false);
  const [directoriesExpanded, setDirectoriesExpanded] = useState(false);
  const [directoriesClosing, setDirectoriesClosing] = useState(false);
  const indexDetailsCollapseTimerRef = useRef<number | null>(null);
  const directoriesCollapseTimerRef = useRef<number | null>(null);
  const recognitionStatusLabels = getRecognitionStatusLabels();
  const directoryFileTotal = directories.some((directory) => directory.fileCount === null)
    ? indexStats.totalFiles
    : directories.reduce((sum, directory) => sum + (directory.fileCount ?? 0), 0);
  const recognizedFileTotal = Math.min(indexStats.recognizedFiles, directoryFileTotal);
  const unrecognizedFileTotal = Math.max(0, directoryFileTotal - recognizedFileTotal);
  const indexStatItems: Array<{ status: RecognitionStatusFilter; label: string; value: number; title: string }> = [
    { status: "all", label: recognitionStatusLabels.all, value: directoryFileTotal, title: t("settings.viewAllSupportedHint") },
    { status: "recognized", label: recognitionStatusLabels.recognized, value: recognizedFileTotal, title: t("settings.viewRecognizedHint") },
    { status: "unrecognized", label: recognitionStatusLabels.unrecognized, value: unrecognizedFileTotal, title: t("settings.viewUnrecognizedHint") }
  ];
  const indexFailed = aiProgress?.phase === "failed" || Boolean(scanError);
  const indexCancelled = aiProgress?.phase === "cancelled";
  const indexCompleted = !indexFailed && !indexCancelled && (aiProgress?.phase === "completed" || scanSummary !== null);
  const indexIsRecognizing = aiProgress?.phase === "checking" || aiProgress?.phase === "processing";
  const indexRecognitionStarted = indexIsRecognizing
    || Boolean(aiProgress?.currentFileName)
    || (aiProgress?.total ?? scanSummary?.aiTotal ?? 0) > 0
    || scanSummary !== null;
  const indexStatusLabel = indexCancelled
    ? t("common.cancelled")
    : indexFailed ? indexRecognitionStarted ? t("settings.recognitionFailed") : t("settings.scanFailed")
      : indexCompleted ? t("common.completed")
        : isScanning ? indexIsRecognizing ? t("settings.indexRecognizing") : t("settings.indexScanning")
          : t("common.idle");
  const indexProgressTotal = aiProgress?.total ?? scanSummary?.aiTotal ?? 0;
  const indexProgressCurrent = aiProgress?.current ?? (indexCompleted ? indexProgressTotal : 0);
  const indexCompletedCount = aiProgress?.completed ?? scanSummary?.aiCompleted ?? 0;
  const indexFailedCount = aiProgress?.failed ?? scanSummary?.aiFailed ?? 0;
  const indexErrorSummary = indexFailed ? formatDisplayMessage(scanError || aiProgress?.message) : "";
  const hasIndexDetails = isScanning || aiProgress !== null || scanSummary !== null || Boolean(scanError);

  useEffect(() => {
    if (isScanning) {
      if (indexDetailsCollapseTimerRef.current !== null) {
        window.clearTimeout(indexDetailsCollapseTimerRef.current);
        indexDetailsCollapseTimerRef.current = null;
      }
      setIndexDetailsClosing(false);
      setIndexDetailsExpanded(true);
    }
  }, [isScanning]);

  useEffect(() => {
    if (directories.length > 0) return;
    if (directoriesCollapseTimerRef.current !== null) {
      window.clearTimeout(directoriesCollapseTimerRef.current);
      directoriesCollapseTimerRef.current = null;
    }
    setDirectoriesExpanded(false);
    setDirectoriesClosing(false);
  }, [directories.length]);

  useEffect(() => () => {
    if (indexDetailsCollapseTimerRef.current !== null) {
      window.clearTimeout(indexDetailsCollapseTimerRef.current);
    }
    if (directoriesCollapseTimerRef.current !== null) {
      window.clearTimeout(directoriesCollapseTimerRef.current);
    }
  }, []);

  const closeIndexDetails = () => {
    if (isScanning || indexDetailsClosing) return;
    setIndexDetailsClosing(true);
    const collapseDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    indexDetailsCollapseTimerRef.current = window.setTimeout(() => {
      setIndexDetailsExpanded(false);
      setIndexDetailsClosing(false);
      indexDetailsCollapseTimerRef.current = null;
    }, collapseDuration);
  };

  const toggleDirectories = () => {
    if (directoriesClosing) return;
    if (!directoriesExpanded) {
      setDirectoriesExpanded(true);
      return;
    }
    onCancelDirectoryEdit();
    setDirectoriesClosing(true);
    const collapseDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    directoriesCollapseTimerRef.current = window.setTimeout(() => {
      setDirectoriesExpanded(false);
      setDirectoriesClosing(false);
      directoriesCollapseTimerRef.current = null;
    }, collapseDuration);
  };

  return (
    <>
<div className="cap-settings-row cap-settings-row-source">
            <span className="cap-settings-label">{t("settings.recognitionStatus")}</span>
            {indexStatItems.map((item) => (
              <button
                key={item.status}
                className={`cap-settings-pill cap-settings-stat${selectedIndexStat === item.status ? " selected" : ""}`}
                type="button"
                title={item.title}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectedIndexStatChange(item.status);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onOpenIndexView(item.status);
                }}
              >
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </button>
            ))}
          </div>

          <div className="cap-settings-row cap-settings-row-directory-config">
            <span className="cap-settings-label">{t("settings.directoryConfig")}</span>
            <span className="cap-settings-value">{directoryServiceUnavailable ? t("common.unavailable") : isLoadingDirectories ? t("settings.directoryLoading") : directories.length === 0 ? t("settings.directoryEmpty") : t("settings.directoryCount", { count: directories.length })}</span>
            <button className="cap-settings-pill" type="button" onClick={onStartAdd} title={t("settings.addDirectoryActionHint")} disabled={isAddingDirectory}>{t("common.add")}</button>
            <button
              className="cap-settings-pill cap-settings-expand-toggle"
              type="button"
              onClick={toggleDirectories}
              title={directoriesExpanded ? t("settings.collapseDirectoriesHint") : t("settings.expandDirectoriesHint")}
              disabled={isLoadingDirectories || directoryServiceUnavailable || directories.length === 0}
              aria-expanded={directoriesExpanded}
            >
              {directoriesExpanded ? t("common.collapse") : t("common.manage")}
            </button>
          </div>

          <div className="cap-settings-row cap-settings-row-directory-actions">
            <span className="cap-settings-label">{t("settings.index")}</span>
            <button
              className="cap-settings-pill"
              type="button"
              onClick={isScanning && aiProgress?.cancellable === true ? onCancelRecognition : indexFailed ? onRetryIndex : onContinueRecognition}
              title={isScanning && aiProgress?.cancellable === true ? t("settings.cancelRecognitionActionHint") : indexFailed ? t("settings.retryIndexActionHint") : t("settings.continueRecognitionActionHint")}
              disabled={isScanning ? aiProgress?.cancellable !== true || isCancellingRecognition : !indexFailed && indexStats.pendingVisualImages === 0}
            >
              {isScanning && aiProgress?.cancellable === true ? isCancellingRecognition ? t("settings.cancellingRecognition") : t("common.cancel") : indexFailed ? t("common.retry") : t("settings.continueRecognition")}
            </button>
            <button className="cap-settings-pill" type="button" onClick={onUpdateAll} title={isScanning ? indexStatusLabel : t("settings.updateAllActionHint")} disabled={isScanning}>
              {isScanning ? indexIsRecognizing ? t("settings.recognizing") : t("settings.scanning") : t("settings.updateAll")}
            </button>
          </div>

          {indexDetailsExpanded && hasIndexDetails && (
            <div className={`cap-settings-expandable-shell${indexDetailsClosing ? " is-closing" : ""}`}>
              <div className="cap-settings-expandable-inner">
                <div className="cap-settings-quick-actions-panel cap-settings-index-panel">
              <div className="cap-settings-quick-actions-header">
                <span className="cap-settings-label">{t("settings.indexStatus")}</span>
                {!isScanning && (
                  <div className="cap-settings-quick-actions-controls">
                    <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={closeIndexDetails} title={t("settings.collapseIndexDetailsHint")} aria-expanded="true">{t("common.collapse")}</button>
                  </div>
                )}
              </div>
              <div className="ai-details-grid">
                <span>{t("settings.indexStage")}</span>
                <strong>{indexStatusLabel}</strong>
                <span>{t("settings.indexProgress")}</span>
                <strong>{indexProgressCurrent} / {indexProgressTotal}</strong>
                <span>{t("settings.indexSuccessCount")}</span>
                <strong>{indexCompletedCount}</strong>
                <span>{t("settings.indexFailureCount")}</span>
                <strong>{indexFailedCount}</strong>
                {aiProgress?.currentFileName && (
                  <>
                    <span>{t("settings.indexCurrentFile")}</span>
                    <strong title={aiProgress.currentFileName}>{aiProgress.currentFileName}</strong>
                  </>
                )}
                {indexErrorSummary && (
                  <>
                    <span>{t("settings.indexErrorSummary")}</span>
                    <strong title={indexErrorSummary}>{indexErrorSummary}</strong>
                  </>
                )}
              </div>
                </div>
              </div>
            </div>
          )}

          {directoriesExpanded && !isLoadingDirectories && directories.length > 0 && (
            <div className={`cap-settings-expandable-shell${directoriesClosing ? " is-closing" : ""}`}>
              <div className="cap-settings-expandable-inner">
                <div className="cap-settings-directory-list">
              {directories.map((directory) => (
              <div className="cap-settings-row cap-settings-directory-row" key={directory.id}>
                {editingDirectoryId === directory.id ? (
                  <input
                    className="cap-settings-inline-input"
                    autoFocus
                    defaultValue={directory.name}
                    onBlur={(event) => {
                      if (event.currentTarget.dataset.cancelled === "true") return;
                      onDirectoryNameChange(directory.id, event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget.dataset.cancelled = "true";
                        onCancelDirectoryEdit();
                        return;
                      }
                      if (event.key === "Enter") onDirectoryNameChange(directory.id, event.currentTarget.value);
                    }}
                  />
                ) : (
                  <button className="cap-settings-pill cap-settings-directory-name" type="button" onDoubleClick={() => onEditDirectory(directory.id)} title={t("settings.renameDirectoryHint")}>
                    {directory.name}
                  </button>
                )}
                <span className="cap-settings-value cap-settings-path" title={directory.path}>{directory.path}</span>
                <span className="cap-settings-pill" title={t("settings.directoryFileCountHint")}>{directory.fileCount ?? "…"}{directory.scanStatus === "missing" || directory.scanStatus === "error" ? ` ${t("common.abnormal")}` : ""}</span>
                <button className="cap-settings-pill" type="button" onClick={() => onRecognizeDirectory(directory.id)} title={t("settings.recognizeDirectoryActionHint")} disabled={isScanning}>
                  {t("settings.recognizeDirectory")}
                </button>
                <button className="cap-settings-pill" type="button" onClick={() => onDeleteDirectory(directory.id)} title={t("settings.deleteDirectoryActionHint")} disabled={isScanning}>
                  {t("common.delete")}
                </button>
              </div>
              ))}
                </div>
              </div>
            </div>
          )}
    </>
  );
};
