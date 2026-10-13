import { useState } from "react";
import { t } from "../../../electron/localization";
import type { ComputerSearchSort } from "../../shared/computerSearchFactTypes";
import StableUiIcon from "../stable-ui/StableUiIcon";
import StableSidebarFlyout from "../stable-ui/StableSidebarFlyout";

const options: ComputerSearchSort[] = ["name-ascending", "name-descending", "modified-descending", "modified-ascending"];
const label = (sort: ComputerSearchSort) => `${t(sort.startsWith("name") ? "sort.field.name" : "sort.field.modifiedAt")} · ${t(sort.endsWith("ascending") ? "sort.direction.asc" : "sort.direction.desc")}`;
export default function CatalogToolbarViewControls({ sort, onSort, showHidden, onShowHidden }: {
  sort: ComputerSearchSort; onSort: (sort: ComputerSearchSort) => void; showHidden: boolean; onShowHidden: () => void;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return <div className="cap-catalog-view-controls">
    <button type="button" title={label(sort)} aria-label={t("sort.parent")} aria-expanded={anchor !== null}
      onClick={event => setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect())}>
      <StableUiIcon name="sort" sortDirection={sort.endsWith("ascending") ? "asc" : "desc"} className="cap-catalog-toolbar-icon cap-catalog-sort-icon" /><span>{label(sort)}</span>
    </button>
    <button type="button" role="switch" aria-checked={showHidden} aria-label={t("settings.hiddenFiles")} title={t("settings.hiddenFiles")}
      className="cap-catalog-hidden-switch" onClick={onShowHidden}><span>{t("settings.hiddenFiles")}</span><i aria-hidden="true"><b /></i></button>
    {anchor && <StableSidebarFlyout anchor={anchor} label={t("sort.parent")} placement="below" onClose={() => setAnchor(null)}>
      {options.map(value => <button key={value} type="button" aria-pressed={value === sort} className={value === sort ? "is-selected" : ""}
        onClick={() => { onSort(value); setAnchor(null); }}>{label(value)}</button>)}
    </StableSidebarFlyout>}
  </div>;
}
