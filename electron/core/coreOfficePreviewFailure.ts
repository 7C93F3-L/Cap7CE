import { t } from "../localization";
export const officePreviewFailure = (error: unknown): Error => (error as { code?: string })?.code === "EOFFICEINUSE" ? new Error(t("preview.officeInUse")) : error as Error;
