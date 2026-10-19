import { t } from "./localization";
export const getTrashFailureMessage = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  let message = error instanceof Error ? error.message : "";
  if (message === "core-trash-protected-path") message = t("file.protectedCache");
  if (message === "core-trash-target-changed") message = t("catalogActions.targetChanged");
  if (message === "core-trash-not-file") message = t("file.sourceNotFile");
  if (code === "ENOENT") {
    return t("file.sourceMissing");
  }
  if (code === "EACCES" || code === "EPERM") {
    return t("file.trashPermissionDenied");
  }
  if (/operation was aborted/i.test(message)) {
    return t("file.trashOperationAborted");
  }
  if (message.startsWith("core-trash-")) return t("file.trashFailed");
  return message
    ? t("file.trashFailedWithMessage", { message })
    : t("file.trashFailed");
};
