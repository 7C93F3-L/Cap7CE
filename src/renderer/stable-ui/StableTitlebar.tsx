import type { ReactNode } from "react";
import WindowPinButton from "../window-presentation/WindowPinButton";

interface StableTitlebarProps {
  pinned: boolean;
  pinLabel: string;
  searchInput: ReactNode;
  resultStatus: ReactNode;
  onTogglePinned: () => void;
}

const StableTitlebar = ({ pinned, pinLabel, searchInput, resultStatus, onTogglePinned }: StableTitlebarProps) => (
  <header className="cap-stable-titlebar" data-window-controls="true">
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
);

export default StableTitlebar;
