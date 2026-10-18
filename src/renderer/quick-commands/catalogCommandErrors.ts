import { t } from "../../../electron/localization";

export class CatalogCommandError extends Error {}
export const requireCommandSuccess = (value: unknown, message = t("catalogCommand.failed")) => {
  if (!value) throw new CatalogCommandError(message);
};
export const catalogCommandErrorMessage = (error: unknown) => error instanceof CatalogCommandError ? error.message : t("catalogCommand.failed");
