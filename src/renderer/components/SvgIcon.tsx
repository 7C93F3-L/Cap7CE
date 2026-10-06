import { useId, useMemo } from "react";
import { namespaceSvgIds } from "./svgIdNamespace";

const SvgIcon = ({ svg, className = "cap-svg-icon" }: { svg: string; className?: string }) => {
  const prefix = `cap-svg-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const content = useMemo(() => namespaceSvgIds(svg, prefix), [svg, prefix]);
  return <span className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: content }} />;
};

export default SvgIcon;
