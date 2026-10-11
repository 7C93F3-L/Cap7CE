import { useState } from "react";
import { t } from "../../../electron/localization";

export default function SettingsMetadataBuildControl() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const open = async () => {
    if (busy) return;
    setBusy(true); setFailed(false);
    try { setFailed(await window.cap7ce?.settingsWindow.openMetadataBuild() !== true); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return <div className="cap-stable-settings-action-line">
    {failed && <span role="alert">{t("stableSettings.metadataBuildOpenFailed")}</span>}
    <button type="button" className="cap-stable-settings-button" disabled={busy} onClick={() => void open()}>{t("stableSettings.manageMetadataBuild")}</button>
  </div>;
}
