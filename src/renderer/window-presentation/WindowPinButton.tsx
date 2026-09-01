import iconPinOffSvg from "../assets/icons/icon-pin-off.svg?raw";
import iconPinOnSvg from "../assets/icons/icon-pin-on.svg?raw";

interface WindowPinButtonProps {
  pinned: boolean;
  label: string;
  onToggle: () => void;
  className: string;
  iconClassName: string;
}

const WindowPinButton = ({ pinned, label, onToggle, className, iconClassName }: WindowPinButtonProps) => (
  <button
    className={className}
    type="button"
    onClick={onToggle}
    onMouseDown={(event) => { event.preventDefault(); event.currentTarget.blur(); }}
    aria-label={label}
    title={label}
    aria-pressed={pinned}
  >
    <span
      className={`cap-svg-icon ${iconClassName}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: pinned ? iconPinOnSvg : iconPinOffSvg }}
    />
  </button>
);

export default WindowPinButton;
