import { useState, type ComponentProps } from "react";
import StableExploreFilters from "../stable-ui/StableExploreFilters";
import { t } from "../../../electron/localization";

export default function CatalogTopFilters({ search, availableFormats, detailDomains, onChange, onClear, count }: {
  search: ComponentProps<typeof StableExploreFilters>["search"];
  availableFormats: string[]; detailDomains?: ComponentProps<typeof StableExploreFilters>["detailDomains"];
  onChange: ComponentProps<typeof StableExploreFilters>["onSearchOptionsChange"]; onClear: () => void; count: number;
}) {
  const [close, setClose] = useState(0);
  return <section className="cap-catalog-top-filters" aria-label={t("workspace.filters")}>
    <div className="cap-catalog-filter-actions"><span>{t("workspace.activeFilters", { count })}</span>
      <button type="button" disabled={!count} onClick={onClear}>{t("explore.clearFilters")}</button></div>
    <div className="cap-catalog-top-filter-scroll" onScroll={() => setClose(value => value + 1)}>
      <StableExploreFilters search={search} availableFormats={availableFormats} detailDomains={detailDomains}
        closeFlyoutRequest={close} onFlyoutOpen={() => {}} onSearchOptionsChange={onChange} />
    </div>
  </section>;
}
