import waitingSvg from "../../resources/icons/waiting.svg?raw";

const WaitingIndicator = ({ className = "" }: { className?: string }) => (
  <span
    className={`cap-svg-icon cap-waiting-icon${className ? ` ${className}` : ""}`}
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: waitingSvg }}
  />
);

export default WaitingIndicator;
