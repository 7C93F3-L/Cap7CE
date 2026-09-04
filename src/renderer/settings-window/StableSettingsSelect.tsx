import type { CSSProperties } from "react";
import { SettingsSelect, type SettingsSelectOption } from "../settings/SettingsSelect";
import "./StableSettingsSelect.css";

interface StableSettingsSelectProps {
  value: string;
  options: SettingsSelectOption[];
  label: string;
  menuStyle: CSSProperties;
  disabled?: boolean;
  onChange: (value: string) => void;
}

const StableSettingsSelect = ({
  value,
  options,
  label,
  menuStyle,
  disabled = false,
  onChange
}: StableSettingsSelectProps) => (
  <SettingsSelect
    value={value}
    options={options}
    disabled={disabled}
    ariaLabel={label}
    title={label}
    className="cap-stable-settings-select"
    menuClassName="cap-stable-settings-select-menu"
    menuStyle={menuStyle}
    onChange={onChange}
  />
);

export default StableSettingsSelect;
