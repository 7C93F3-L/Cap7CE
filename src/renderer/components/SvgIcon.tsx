const SvgIcon = ({ svg, className = "cap-svg-icon" }: { svg: string; className?: string }) => (
  <span className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
);

export default SvgIcon;
