import WindowPinButton from "../window-presentation/WindowPinButton";

interface StableTitlebarProps {
  pinned: boolean;
  onTogglePinned: () => void;
}

const StableTitlebar = ({ pinned, onTogglePinned }: StableTitlebarProps) => (
  <header className="cap-stable-titlebar" data-window-controls="true">
    <div className="cap-stable-search-slot" role="search" aria-label="搜索输入布局占位区">
      <span>搜索</span>
    </div>
    <span className="cap-stable-result-count">U2 · 响应式骨架</span>
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
