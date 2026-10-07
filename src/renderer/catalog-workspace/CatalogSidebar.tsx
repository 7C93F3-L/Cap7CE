import { t } from "../../../electron/localization";
import FavoriteDirectoryList, { type FavoriteDirectoryListProps } from "../favorite-directories/FavoriteDirectoryList";
import StableUiIcon from "../stable-ui/StableUiIcon";
import type { useCatalogLayout } from "./useCatalogLayout";

export default function CatalogSidebar({ layout, favorites, onSettings }: {
  layout: ReturnType<typeof useCatalogLayout>; favorites: FavoriteDirectoryListProps;
  onSettings: () => void;
}) {
  return <aside className={`cap-catalog-sidebar${layout.collapsed ? " is-collapsed" : ""}`}>
    <button className="cap-catalog-brand" type="button" title="展开或收起目录栏" onClick={layout.toggleWidth}>{layout.collapsed ? "C7" : "Cap7CE"}</button>
    <nav className="cap-catalog-layout-tools" aria-label={t("workspace.navigation")}>
      <button type="button" title="显示或隐藏顶部筛选" aria-label={t("workspace.filters")} aria-expanded={layout.filtersVisible} onClick={layout.toggleFilters}><StableUiIcon name="scope" /></button>
      <button type="button" title="显示或隐藏详细信息" aria-label="详细信息" aria-expanded={layout.detailsVisible} onClick={layout.toggleDetails}>▣</button>
    </nav>
    <FavoriteDirectoryList {...favorites} showIcons />
    <div className="cap-catalog-sidebar-bottom"><button type="button" title="文件属性建库" aria-label="文件属性建库" onClick={layout.toggleMetadata}>◷<span>文件属性建库</span></button>
      <button type="button" title={t("window.openSettings")} aria-label={t("window.openSettings")} onClick={onSettings}><StableUiIcon name="settings" /><span>{t("window.openSettings")}</span></button></div>
    <div className="cap-catalog-resizer" role="separator" aria-label="目录栏宽度" aria-orientation="vertical" aria-valuenow={Math.round(layout.width)} aria-valuemin={52} aria-valuemax={320}
      tabIndex={0} onPointerDown={layout.startResize} onKeyDown={event => { if (event.key.startsWith("Arrow")) { event.preventDefault(); layout.resizeKey(event.key); } }} />
  </aside>;
}
