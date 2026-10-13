import SvgIcon from "../components/SvgIcon";
import CatalogName from "./CatalogName";

export default function CatalogIconVisual({ icon, name, isFile = false }: { icon: string; name: string; isFile?: boolean }) {
  return <span className="result-file-card">
    <SvgIcon svg={icon} className="cap-svg-icon result-file-card-icon" />
    <CatalogName name={name} isFile={isFile} className="result-file-card-name" />
  </span>;
}
