import warningGradientSvg from "../assets/icons/warning-gradient.svg?raw";
import { t } from "../../../electron/localization";
import SvgIcon from "../components/SvgIcon";
import WaitingIndicator from "../WaitingIndicator";
import type { CacheClearFeedback, DeleteFilesFeedback, DroppedDirectory } from "./dialogTypes";
import DialogShell from "./DialogShell";

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
  <DialogShell label={t("delete.fileDialogTitle")}>
        {isDeleting
          ? <WaitingIndicator className="delete-files-waiting-icon" />
          : <SvgIcon svg={warningGradientSvg} className="cap-svg-icon delete-files-warning-icon cap-dialog-warning-icon" />}
        <div className="delete-files-message cap-dialog-message">
          {isDeleting
            ? t("delete.movingToTrash", { count: fileCount })
            : feedback?.status === "failed"
              ? t("delete.failedCount", { count: feedback.failedCount })
              : feedback?.status === "succeeded"
                ? t("delete.completed")
                : t("delete.fileQuestion")}
        </div>
        <div className="modal-actions cap-dialog-actions">
          <button type="button" disabled={isDeleting} onClick={onCancel}>{t("common.cancel")}</button>
          <button type="button" disabled={isDeleting} onClick={feedback?.status === "succeeded" ? onComplete : onConfirm}>
            {feedback?.status === "failed" ? t("common.retry") : feedback?.status === "succeeded" ? t("common.done") : t("common.delete")}
          </button>
        </div>
  </DialogShell>
);

export const DeleteDirectoryPanel = ({
  onConfirm,
  onCancel
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <DialogShell label={t("delete.directoryDialogTitle")}>
        <SvgIcon svg={warningGradientSvg} className="cap-svg-icon delete-files-warning-icon cap-dialog-warning-icon" />
        <div className="delete-files-message cap-dialog-message">{t("delete.directoryQuestion")}</div>
        <div className="modal-actions cap-dialog-actions">
          <button type="button" onClick={onCancel}>{t("common.confirmNo")}</button>
          <button type="button" onClick={onConfirm}>{t("common.confirmYes")}</button>
        </div>
  </DialogShell>
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
  <DialogShell label={t("directoryAdd.dropDialogTitle")}>
        <SvgIcon svg={warningGradientSvg} className="cap-svg-icon delete-files-warning-icon cap-dialog-warning-icon" />
        <div className="delete-files-message cap-dialog-message">
          {directories.length === 1
            ? t("directoryAdd.dropSingleQuestion", { name: directories[0].name })
            : t("directoryAdd.dropMultipleQuestion", { count: directories.length })}
        </div>
        <div className="modal-actions cap-dialog-actions">
          <button type="button" onClick={onCancel} disabled={isAdding}>{t("common.cancel")}</button>
          <button type="button" onClick={onConfirm} disabled={isAdding}>{t("common.confirm")}</button>
        </div>
  </DialogShell>
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
  <DialogShell label={t("directoryAdd.replaceDialogTitle")}>
        <SvgIcon svg={warningGradientSvg} className="cap-svg-icon delete-files-warning-icon cap-dialog-warning-icon" />
        <div className="delete-files-message cap-dialog-message">
          {t("directoryAdd.replaceQuestion", { candidates: conflictCount, count: replacedCount })}
        </div>
        <div className="modal-actions cap-dialog-actions">
          <button type="button" onClick={onCancel} disabled={isAdding}>{t("common.confirmNo")}</button>
          <button type="button" onClick={onConfirm} disabled={isAdding}>{t("common.confirmYes")}</button>
        </div>
  </DialogShell>
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
  <DialogShell label={skim ? t("cache.skimDialogTitle") : t("cache.dialogTitle")}>
        <SvgIcon svg={warningGradientSvg} className="cap-svg-icon delete-files-warning-icon cap-dialog-warning-icon" />
        <div className="delete-files-message cap-dialog-message">
          {feedback?.status === "failed" ? feedback.message : feedback?.status === "succeeded" ? t("cache.completed") : (
            <>
              {skim ? t("cache.skimRegenerationHint") : t("cache.regenerationHint")}<br />
              {t("cache.clearQuestion")}
            </>
          )}
        </div>
        <div className="modal-actions cap-dialog-actions">
          <button type="button" disabled={isClearing} onClick={onCancel}>{t("common.cancel")}</button>
          <button type="button" disabled={isClearing} onClick={feedback?.status === "succeeded" ? onComplete : onConfirm}>
            {feedback?.status === "failed" ? t("common.retry") : feedback?.status === "succeeded" ? t("common.done") : t("settings.clearCache")}
          </button>
        </div>
  </DialogShell>
);
