import warningGradientSvg from "../assets/icons/warning-gradient.svg?raw";
import { t } from "../../../electron/localization";
import SvgIcon from "../components/SvgIcon";
import WaitingIndicator from "../WaitingIndicator";
import type { CacheClearFeedback, DeleteFilesFeedback, DroppedDirectory } from "./dialogTypes";

export const DeleteFilesPanel = ({
  isDeleting,
  fileCount,
  feedback,
  onConfirm,
  onCancel,
  onComplete
}: {
  isDeleting: boolean;
  fileCount: number;
  feedback: DeleteFilesFeedback | null;
  onConfirm: () => void;
  onCancel: () => void;
  onComplete: () => void;
}) => (
  <main className="keyword-editor-view delete-files-view">
    <section className="keyword-editor-panel delete-files-panel" role="dialog" aria-modal="true" aria-label={t("delete.fileDialogTitle")}>
      <div className="delete-files-content">
        {isDeleting
          ? <WaitingIndicator className="delete-files-waiting-icon" />
          : <SvgIcon svg={warningGradientSvg} className="cap-svg-icon delete-files-warning-icon" />}
        <div className="delete-files-message">
          {isDeleting
            ? t("delete.movingToTrash", { count: fileCount })
            : feedback?.status === "failed"
              ? t("delete.failedCount", { count: feedback.failedCount })
              : feedback?.status === "succeeded"
                ? t("delete.completed")
                : t("delete.fileQuestion")}
        </div>
        <div className="modal-actions">
          <button type="button" disabled={isDeleting} onClick={onCancel}>{t("common.cancel")}</button>
          <button type="button" disabled={isDeleting} onClick={feedback?.status === "succeeded" ? onComplete : onConfirm}>
            {feedback?.status === "failed" ? t("common.retry") : feedback?.status === "succeeded" ? t("common.done") : t("common.delete")}
          </button>
        </div>
      </div>
    </section>
  </main>
);

export const DeleteDirectoryPanel = ({
  onConfirm,
  onCancel
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <main className="keyword-editor-view delete-files-view">
    <section className="keyword-editor-panel delete-files-panel" role="dialog" aria-modal="true" aria-label={t("delete.directoryDialogTitle")}>
      <div className="delete-files-content">
        <SvgIcon svg={warningGradientSvg} className="cap-svg-icon delete-files-warning-icon" />
        <div className="delete-files-message">{t("delete.directoryQuestion")}</div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>{t("common.confirmNo")}</button>
          <button type="button" onClick={onConfirm}>{t("common.confirmYes")}</button>
        </div>
      </div>
    </section>
  </main>
);

export const AddDroppedDirectoriesPanel = ({
  directories,
  isAdding,
  onConfirm,
  onCancel
}: {
  directories: DroppedDirectory[];
  isAdding: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <main className="keyword-editor-view delete-files-view">
    <section className="keyword-editor-panel delete-files-panel" role="dialog" aria-modal="true" aria-label={t("directoryAdd.dropDialogTitle")}>
      <div className="delete-files-content">
        <SvgIcon svg={warningGradientSvg} className="cap-svg-icon delete-files-warning-icon" />
        <div className="delete-files-message">
          {directories.length === 1
            ? t("directoryAdd.dropSingleQuestion", { name: directories[0].name })
            : t("directoryAdd.dropMultipleQuestion", { count: directories.length })}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={isAdding}>{t("common.cancel")}</button>
          <button type="button" onClick={onConfirm} disabled={isAdding}>{t("common.confirm")}</button>
        </div>
      </div>
    </section>
  </main>
);

export const ReplaceDirectoriesPanel = ({
  conflictCount,
  replacedCount,
  isAdding,
  onConfirm,
  onCancel
}: {
  conflictCount: number;
  replacedCount: number;
  isAdding: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <main className="keyword-editor-view delete-files-view">
    <section className="keyword-editor-panel delete-files-panel" role="dialog" aria-modal="true" aria-label={t("directoryAdd.replaceDialogTitle")}>
      <div className="delete-files-content">
        <SvgIcon svg={warningGradientSvg} className="cap-svg-icon delete-files-warning-icon" />
        <div className="delete-files-message">
          {t("directoryAdd.replaceQuestion", { candidates: conflictCount, count: replacedCount })}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={isAdding}>{t("common.confirmNo")}</button>
          <button type="button" onClick={onConfirm} disabled={isAdding}>{t("common.confirmYes")}</button>
        </div>
      </div>
    </section>
  </main>
);

export const ClearCachePanel = ({
  isClearing,
  feedback,
  skim = false,
  onConfirm,
  onCancel,
  onComplete
}: {
  isClearing: boolean;
  feedback: CacheClearFeedback | null;
  skim?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onComplete: () => void;
}) => (
  <main className="keyword-editor-view delete-files-view">
    <section className="keyword-editor-panel delete-files-panel" role="dialog" aria-modal="true" aria-label={skim ? t("cache.skimDialogTitle") : t("cache.dialogTitle")}>
      <div className="delete-files-content">
        <SvgIcon svg={warningGradientSvg} className="cap-svg-icon delete-files-warning-icon" />
        <div className="delete-files-message">
          {feedback?.status === "failed" ? feedback.message : feedback?.status === "succeeded" ? t("cache.completed") : (
            <>
              {skim ? t("cache.skimRegenerationHint") : t("cache.regenerationHint")}<br />
              {t("cache.clearQuestion")}
            </>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" disabled={isClearing} onClick={onCancel}>{t("common.cancel")}</button>
          <button type="button" disabled={isClearing} onClick={feedback?.status === "succeeded" ? onComplete : onConfirm}>
            {feedback?.status === "failed" ? t("common.retry") : feedback?.status === "succeeded" ? t("common.done") : t("settings.clearCache")}
          </button>
        </div>
      </div>
    </section>
  </main>
);
