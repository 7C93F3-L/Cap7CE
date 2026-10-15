import { t } from "../../../electron/localization";

export default function FavoriteOperationNotice({ message, onDismiss, onRetry }: { message: string; onDismiss: () => void; onRetry: () => void }) {
  const key = message.includes("folder-rename-save-pending") ? "favorites.renameSavePending"
    : message.includes("folder-rename-favorite-conflict") ? "favorites.renameFavoriteConflict"
    : message.includes("folder-rename-invalid-name") ? "favorites.invalidFolderName"
    : message.includes("folder-rename-protected") || message.includes("folder-rename-root") ? "favorites.renameProtected"
    : message.includes("folder-rename-recovery") ? "favorites.renameRecovery"
    : message.includes("folder-rename") ? "favorites.renameFailed" : "favorites.operationFailed";
  return <div className="cap-catalog-attribute-notice cap-favorite-operation-notice" role="status">
    <span>{t(key)}</span>{message.includes("folder-rename-save-pending") && <button type="button" onClick={onRetry}>{t("common.retry")}</button>}
    <button type="button" onClick={onDismiss} aria-label={t("common.close")}>×</button>
  </div>;
}
