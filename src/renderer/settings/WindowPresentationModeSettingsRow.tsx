import { useState } from "react";
import { t } from "../../../electron/localization";
import type { WindowPresentationMode } from "../../shared/types";

interface WindowPresentationModeSettingsRowProps {
  activeMode: WindowPresentationMode;
}

type SwitchStatus = "idle" | "switching" | "failed";

export const WindowPresentationModeSettingsRow = ({ activeMode }: WindowPresentationModeSettingsRowProps) => {
  const [status, setStatus] = useState<SwitchStatus>("idle");
  const targetMode: WindowPresentationMode = activeMode === "cap7ce" ? "compatibility" : "cap7ce";
  const targetLabel = targetMode === "compatibility" ? t("settings.compatibilityMode") : t("settings.cap7ceMode");
  const switchHint = targetMode === "compatibility" ? t("settings.switchToCompatibilityHint") : t("settings.switchToCap7CEHint");

  const switchMode = async () => {
    if (status === "switching") return;
    setStatus("switching");
    try {
      const result = await window.cap7ce?.app.switchWindowPresentationMode(targetMode);
      if (!result || result.status === "failed") {
        setStatus("failed");
        return;
      }
      if (result.status === "unchanged") setStatus("idle");
    } catch {
      setStatus("failed");
    }
  };

  const buttonLabel = status === "switching"
    ? t("settings.switchingWindowMode")
    : status === "failed"
      ? t("common.retry")
      : t("settings.switchWindowMode");

  return (
    <div className="cap-settings-row cap-settings-row-half">
      <span className="cap-settings-label">{targetLabel}</span>
      <span className="cap-settings-value">{t("settings.windowModeSwitchDescription")}</span>
      <button
        className="cap-settings-pill"
        type="button"
        disabled={status === "switching"}
        onClick={() => void switchMode()}
        title={status === "failed" ? t("settings.windowModeSwitchFailed") : switchHint}
        aria-label={status === "failed" ? `${targetLabel}：${t("settings.windowModeSwitchFailed")}` : `${targetLabel}：${switchHint}`}
      >
        {buttonLabel}
      </button>
    </div>
  );
};
