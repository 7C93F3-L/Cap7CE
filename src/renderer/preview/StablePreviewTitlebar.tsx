import { getWindowPresentationSymbolColor } from "../../../electron/windowPresentationPolicy";
import type { WindowMaterial } from "../../shared/types";
import WindowPinButton from "../window-presentation/WindowPinButton";
import WindowTitlebarPortal from "../window-presentation/WindowTitlebarPortal";
import "./StablePreviewTitlebar.css";

interface StablePreviewTitlebarProps {
  pinned: boolean;
  label: string;
  onTogglePinned: () => void;
  theme: "light" | "dark";
  windowMaterial: WindowMaterial;
}

const StablePreviewTitlebar = ({ pinned, label, onTogglePinned, theme, windowMaterial }: StablePreviewTitlebarProps) => (
  <WindowTitlebarPortal>
    <header
      className={`app theme-${theme} preview-stable-titlebar`}
      style={{ color: getWindowPresentationSymbolColor(theme) }}
      data-window-material={windowMaterial}
      data-window-controls="true"
    >
      <WindowPinButton
        className="preview-stable-titlebar-pin"
        iconClassName="preview-stable-titlebar-pin-icon"
        pinned={pinned}
        label={label}
        onToggle={onTogglePinned}
      />
    </header>
  </WindowTitlebarPortal>
);

export default StablePreviewTitlebar;
