import { createPortal } from "react-dom";
import { getWindowPresentationSymbolColor } from "../../../electron/windowPresentationPolicy";
import WindowPinButton from "./WindowPinButton";

interface CompatibilityTitlebarProps {
  pinned: boolean;
  label: string;
  onTogglePinned: () => void;
  theme?: "light" | "dark";
}
const CompatibilityTitlebar = ({ pinned, label, onTogglePinned, theme }: CompatibilityTitlebarProps) => {
  return createPortal(<header className={`cap-compatibility-titlebar${theme ? ` app theme-${theme}` : ""}`} style={theme ? { color: getWindowPresentationSymbolColor(theme) } : undefined} data-window-controls="true">
    <WindowPinButton
      className="cap-compatibility-titlebar-pin"
      iconClassName="cap-compatibility-titlebar-pin-icon"
      pinned={pinned}
      label={label}
      onToggle={onTogglePinned}
    />
  </header>, document.body);
};

export default CompatibilityTitlebar;
