import { useRef, useState, type CSSProperties } from "react";
import { t } from "../../../electron/localization";
import type { AppearanceColors } from "../../shared/types";
import ColorPickerPopover from "../ColorPickerPopover";
import "./AppearanceColorSettingsControl.css";

interface AppearanceColorSettingsControlProps {
  appearanceColors: AppearanceColors;
  menuStyle: CSSProperties;
  onPreview: (appearanceColors: AppearanceColors) => void;
  onChange: (appearanceColors: AppearanceColors) => void;
}

const AppearanceColorSettingsControl = ({
  appearanceColors,
  menuStyle,
  onPreview,
  onChange
}: AppearanceColorSettingsControlProps) => {
  const themeColorButtonRef = useRef<HTMLButtonElement | null>(null);
  const accentColorButtonRef = useRef<HTMLButtonElement | null>(null);
  const [activeColor, setActiveColor] = useState<keyof AppearanceColors | null>(null);

  const renderColorButton = (key: keyof AppearanceColors, label: string) => (
    <button
      ref={key === "themeColor" ? themeColorButtonRef : accentColorButtonRef}
      type="button"
      className="cap-stable-settings-color-button"
      aria-label={label}
      title={label}
      onClick={() => setActiveColor((current) => current === key ? null : key)}
    >
      <span>{label}</span>
      <i style={{ background: appearanceColors[key] }} aria-hidden="true" />
    </button>
  );

  return (
    <>
      <div className="cap-stable-settings-colors">
        {renderColorButton("themeColor", t("appearance.themeColor"))}
        {renderColorButton("accentColor", t("appearance.accentColor"))}
      </div>
      {activeColor && (
        <ColorPickerPopover
          key={activeColor}
          anchorRef={activeColor === "themeColor" ? themeColorButtonRef : accentColorButtonRef}
          value={appearanceColors[activeColor]}
          ariaLabel={activeColor === "themeColor" ? t("appearance.themeColor") : t("appearance.accentColor")}
          menuStyle={menuStyle}
          className="cap-stable-settings-color-picker"
          onPreview={(value) => onPreview({ ...appearanceColors, [activeColor]: value })}
          onCommit={(value) => onChange({ ...appearanceColors, [activeColor]: value })}
          onClose={() => setActiveColor(null)}
        />
      )}
    </>
  );
};

export default AppearanceColorSettingsControl;
