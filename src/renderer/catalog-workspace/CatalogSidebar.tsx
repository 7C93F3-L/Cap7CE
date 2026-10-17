import { t } from "../../../electron/localization";
import FavoriteDirectoryList, { type FavoriteDirectoryListProps } from "../favorite-directories/FavoriteDirectoryList";
import StableUiIcon from "../stable-ui/StableUiIcon";
import CatalogPanelIcon from "./CatalogPanelIcon";
import type { useCatalogLayout } from "./useCatalogLayout";
import "./CatalogSidebar.css";
import { useDirectoryMetadataAction } from "../metadata-build/useDirectoryMetadataAction";

export default function CatalogSidebar({ layout, favorites, onSettings }: {
  layout: ReturnType<typeof useCatalogLayout>; favorites: FavoriteDirectoryListProps;
  onSettings: () => void;
}) {
  const metadata = useDirectoryMetadataAction();
  return <aside className={`cap-catalog-sidebar${layout.collapsed ? " is-collapsed" : ""}`}>
    <button className="cap-catalog-brand" type="button" title={layout.collapsed ? "展开目录栏" : "收起目录栏"} aria-label="Cap7CE" onClick={layout.toggleWidth}><span className="cap-catalog-brand-logo" aria-hidden="true" /></button>
    <nav className="cap-catalog-layout-tools" aria-label={t("workspace.navigation")}>
      <button type="button" title={layout.filtersVisible ? "收起顶部筛选" : "显示顶部筛选"} aria-label={t("workspace.filters")} aria-expanded={layout.filtersVisible} onClick={layout.toggleFilters}><CatalogPanelIcon side="top" /></button>
      <button type="button" title={layout.detailsVisible ? "收起详细信息" : "显示详细信息"} aria-label="详细信息" aria-expanded={layout.detailsVisible} onClick={layout.toggleDetails}><CatalogPanelIcon side="right" /></button>
    </nav>
    <FavoriteDirectoryList {...favorites} showIcons onMetadata={metadata.busy ? undefined : directory => { void metadata.start(directory.path); }} metadataMessage={metadata.message} />
    <div className="cap-catalog-sidebar-bottom">
      <button type="button" title={t("window.openSettings")} aria-label={t("window.openSettings")} onClick={onSettings}><StableUiIcon name="settings" /><span className="cap-catalog-settings-label">{t("window.openSettings")}</span></button></div>
    <div className="cap-catalog-resizer" role="separator" aria-label="目录栏宽度" aria-orientation="vertical" aria-valuenow={Math.round(layout.width)} aria-valuemin={52} aria-valuemax={320}
      tabIndex={0} onPointerDown={layout.startResize} onDoubleClick={layout.resetWidth} onKeyDown={event => { if (event.key.startsWith("Arrow")) { event.preventDefault(); layout.resizeKey(event.key); } }} />
  </aside>;
}
