import SvgIcon from "../components/SvgIcon";
import { TwoLineMiddleEllipsisFileName } from "../components/MiddleEllipsisFileName";

export default function CatalogIconVisual({ icon, name }: { icon: string; name: string }) {
  return <span className="result-file-card">
    <SvgIcon svg={icon} className="cap-svg-icon result-file-card-icon" />
    <TwoLineMiddleEllipsisFileName fileName={name} className="result-file-card-name" />
  </span>;
}
