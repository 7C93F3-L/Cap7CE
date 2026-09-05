import type { CSSProperties, ReactNode } from "react";
import type { ResolvedThemeMode, WindowMaterial } from "../../shared/types";
import WindowPinButton from "../window-presentation/WindowPinButton";
import WindowTitlebarPortal from "../window-presentation/WindowTitlebarPortal";
interface StableTitlebarProps {
  theme: ResolvedThemeMode; themeStyle: CSSProperties; windowMaterial: WindowMaterial;
  pinned: boolean; pinLabel: string;
  searchInput: ReactNode; resultStatus: ReactNode;
  onTogglePinned: () => void;
}
const StableTitlebar = ({ theme, themeStyle, windowMaterial, pinned, pinLabel, searchInput, resultStatus, onTogglePinned }: StableTitlebarProps) => (
  <WindowTitlebarPortal>
    <header className={`app theme-${theme} cap-stable-titlebar`} style={themeStyle} data-window-material={windowMaterial} data-window-controls="true">
      {searchInput}
      <span className="cap-stable-result-count">{resultStatus}</span>
      <WindowPinButton
        className="cap-stable-titlebar-pin"
        iconClassName="cap-stable-titlebar-pin-icon"
        pinned={pinned}
        label={pinLabel}
        onToggle={onTogglePinned}
      />
    </header>
  </WindowTitlebarPortal>
);
export default StableTitlebar;
