import iconPinOffSvg from "./assets/icons/icon-pin-off.svg?raw";
import iconPinOnSvg from "./assets/icons/icon-pin-on.svg?raw";
import iconSettingsSvg from "./assets/icons/icon-settings.svg?raw";
import iconSkimSvg from "./assets/icons/icon-skim.svg?raw";
import iconWindowExpandSvg from "./assets/icons/icon-window-expand.svg?raw";
import iconWindowLineSvg from "./assets/icons/icon-window-line.svg?raw";
import { t } from "../../electron/localization";

export type WindowControlIcon = "line" | "expand" | "pinOff" | "pinOn";

export interface WindowControlAction {
  id: string;
  label: string;
  icon: WindowControlIcon;
  pressed?: boolean;
  onClick: () => void;
}

interface WindowControlRailProps {
  actions: WindowControlAction[];
  showSkim?: boolean;
  skimActive?: boolean;
  skimCurrent?: boolean;
  skimExpanded?: boolean;
  skimLabel?: string;
  onSkim?: () => void;
  showSettings: boolean;
  settingsActive?: boolean;
  settingsLabel?: string;
  onSettings: () => void;
}

const controlIcons: Record<WindowControlIcon, string> = {
  line: iconWindowLineSvg,
  expand: iconWindowExpandSvg,
  pinOff: iconPinOffSvg,
  pinOn: iconPinOnSvg
};

const RailSvgIcon = ({ svg, className }: { svg: string; className: string }) => (
  <span
    className={className}
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: svg }}
  />
);

const WindowControlRail = ({ actions, showSkim = false, skimActive = false, skimCurrent = skimActive, skimExpanded, skimLabel, onSkim, showSettings, settingsActive = false, settingsLabel, onSettings }: WindowControlRailProps) => {
  const resolvedSettingsLabel = settingsLabel ?? (settingsActive ? t("window.returnSearch") : t("window.openSettings"));
  const resolvedSkimLabel = skimLabel ?? (skimActive ? t("skim.exit") : t("skim.open"));

  return (
    <div className="cap-window-control-rail" data-window-controls="true">
      <div className="cap-window-controls">
        {actions.map((action) => (
          <button
            className="cap-window-button"
            type="button"
            key={action.id}
            onClick={action.onClick}
            aria-label={action.label}
            title={action.label}
            aria-pressed={action.pressed}
          >
            <RailSvgIcon svg={controlIcons[action.icon]} className="cap-svg-icon cap-window-svg-icon" />
          </button>
        ))}
      </div>
      <div className="cap-window-drag-spacer" aria-hidden="true" />
      {showSkim && onSkim && (
        <button
          className="cap-skim-toggle"
          data-skim-location-toggle="true"
          type="button"
          onClick={onSkim}
          aria-label={resolvedSkimLabel}
          title={resolvedSkimLabel}
          aria-pressed={skimActive}
          aria-current={skimCurrent ? "page" : undefined}
          aria-expanded={skimExpanded}
        >
          <RailSvgIcon svg={iconSkimSvg} className="cap-svg-icon cap-window-svg-icon" />
        </button>
      )}
      {showSettings && (
        <button
          className="cap-settings-toggle"
          type="button"
          onClick={onSettings}
          aria-label={resolvedSettingsLabel}
          title={resolvedSettingsLabel}
          aria-pressed={settingsActive}
          aria-current={settingsActive ? "page" : undefined}
        >
          <RailSvgIcon svg={iconSettingsSvg} className="cap-svg-icon cap-settings-svg-icon" />
        </button>
      )}
    </div>
  );
};

export default WindowControlRail;
