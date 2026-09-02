import { getWindowPresentationSymbolColor } from "../../../electron/windowPresentationPolicy";
import WindowPinButton from "../window-presentation/WindowPinButton";
import WindowTitlebarPortal from "../window-presentation/WindowTitlebarPortal";
import "./StablePreviewTitlebar.css";

interface StablePreviewTitlebarProps {
  pinned: boolean;
  label: string;
  onTogglePinned: () => void;
  theme: "light" | "dark";
}

const StablePreviewTitlebar = ({ pinned, label, onTogglePinned, theme }: StablePreviewTitlebarProps) => (
  <WindowTitlebarPortal>
    <header
      className={`app theme-${theme} preview-stable-titlebar`}
      style={{ color: getWindowPresentationSymbolColor(theme) }}
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
