import { useEffect, useRef, useState } from "react";
import { t } from "../../../electron/localization";
import type { DirectoryItem } from "../../shared/types";

export interface DirectoryAiSettingsRowsProps {
  directories: DirectoryItem[];
  totalFileCount: number | null;
  isLoadingDirectories: boolean;
  isAddingDirectory: boolean;
  directoryServiceUnavailable: boolean;
  aiRecognitionEnabled: boolean;
  editingDirectoryId: string | null;
  onStartAdd: () => void;
  onAiRecognitionEnabledChange: (enabled: boolean) => void;
  onEditDirectory: (id: string) => void;
  onCancelDirectoryEdit: () => void;
  onDirectoryNameChange: (id: string, name: string) => void;
  onDeleteDirectory: (id: string) => void;
}

export const DirectoryAiSettingsRows = ({
  directories,
  totalFileCount,
  isLoadingDirectories,
  isAddingDirectory,
  directoryServiceUnavailable,
  aiRecognitionEnabled,
  editingDirectoryId,
  onStartAdd,
  onAiRecognitionEnabledChange,
  onEditDirectory,
  onCancelDirectoryEdit,
  onDirectoryNameChange,
  onDeleteDirectory
}: DirectoryAiSettingsRowsProps) => {
  const [directoriesExpanded, setDirectoriesExpanded] = useState(false);
  const [directoriesClosing, setDirectoriesClosing] = useState(false);
  const directoriesCollapseTimerRef = useRef<number | null>(null);

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
    if (directoriesCollapseTimerRef.current !== null) window.clearTimeout(directoriesCollapseTimerRef.current);
  }, []);

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
      <div className="cap-settings-row cap-settings-row-directory-config">
        <span className="cap-settings-label">{t("settings.directoryConfig")}</span>
        <span className="cap-settings-value">{directoryServiceUnavailable ? t("common.unavailable") : isLoadingDirectories ? t("settings.directoryLoading") : directories.length === 0 ? t("settings.directoryEmpty") : t("settings.directorySummary", { directoryCount: directories.length, fileCount: totalFileCount ?? "…" })}</span>
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
          onClick={() => onAiRecognitionEnabledChange(!aiRecognitionEnabled)}
          title={aiRecognitionEnabled ? t("settings.disableAiRecognitionHint") : t("settings.enableAiRecognitionHint")}
          aria-pressed={aiRecognitionEnabled}
        >
          {aiRecognitionEnabled ? t("settings.aiRecognitionOn") : t("settings.aiRecognitionOff")}
        </button>
      </div>

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
                  <button className="cap-settings-pill" type="button" onClick={() => onDeleteDirectory(directory.id)} title={t("settings.deleteDirectoryActionHint")}>
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
