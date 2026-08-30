import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { getWindowPresentationSymbolColor } from "../../../electron/windowPresentationPolicy";
import iconPinOffSvg from "../assets/icons/icon-pin-off.svg?raw";
import iconPinOnSvg from "../assets/icons/icon-pin-on.svg?raw";

interface CompatibilityTitlebarProps {
  pinned: boolean;
  label: string;
  onTogglePinned: () => void;
  theme?: "light" | "dark";
}

const CompatibilityTitlebar = ({ pinned, label, onTogglePinned, theme }: CompatibilityTitlebarProps) => {
  const titlebarStyle = theme ? {
    "--compatibility-caption-symbol-color": getWindowPresentationSymbolColor(theme)
  } as CSSProperties : undefined;
  return createPortal(<header className={`cap-compatibility-titlebar${theme ? ` app theme-${theme}` : ""}`} style={titlebarStyle} data-window-controls="true">
    <button
      className="cap-compatibility-titlebar-pin"
      type="button"
      onClick={onTogglePinned}
      onMouseDown={(event) => { event.preventDefault(); event.currentTarget.blur(); }}
      aria-label={label}
      title={label}
      aria-pressed={pinned}
    >
      <span
        className="cap-svg-icon cap-compatibility-titlebar-pin-icon"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: pinned ? iconPinOnSvg : iconPinOffSvg }}
      />
    </button>
  </header>, document.body);
};

export default CompatibilityTitlebar;
