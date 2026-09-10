import chevronSvg from "../assets/icons/icon-chevron.svg?raw";
import SvgIcon from "./SvgIcon";

const ChevronIcon = ({ className = "cap-chevron-icon" }: { className?: string }) => (
  <SvgIcon svg={chevronSvg} className={`cap-svg-icon ${className}`} />
);

export default ChevronIcon;
