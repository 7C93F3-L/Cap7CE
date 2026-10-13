import { useEffect } from "react";
import { t } from "../../../electron/localization";
import "./CatalogGridPreferenceNotice.css";

export default function CatalogGridPreferenceNotice({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => { const timeout = setTimeout(onDismiss, 3000); return () => clearTimeout(timeout); }, [onDismiss]);
  return <div className="cap-catalog-grid-preference-notice" role="status">{t("catalogWorkspace.gridSaveFailed")}</div>;
}
