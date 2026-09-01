import WindowPinButton from "../window-presentation/WindowPinButton";

interface StableTitlebarProps {
  pinned: boolean;
  onTogglePinned: () => void;
}

const StableTitlebar = ({ pinned, onTogglePinned }: StableTitlebarProps) => (
  <header className="cap-stable-titlebar" data-window-controls="true">
    <span className="cap-stable-titlebar-label">Cap7CE · U1</span>
    <WindowPinButton
      className="cap-stable-titlebar-pin"
      iconClassName="cap-stable-titlebar-pin-icon"
      pinned={pinned}
      label={pinned ? "取消固定窗口" : "固定窗口"}
      onToggle={onTogglePinned}
    />
  </header>
);

export default StableTitlebar;
