import { useState, type ComponentProps } from "react";
import StableExploreFilters from "../stable-ui/StableExploreFilters";
import type { useCatalogAttributeAvailability } from "./useCatalogAttributeAvailability";
import { t } from "../../../electron/localization";
import "./CatalogTopFilters.css";

export default function CatalogTopFilters({ search, availableFormats, detailDomains, onChange, onClear, count, attributes }: {
  attributes: ReturnType<typeof useCatalogAttributeAvailability>;
  search: ComponentProps<typeof StableExploreFilters>["search"];
  availableFormats: string[]; detailDomains?: ComponentProps<typeof StableExploreFilters>["detailDomains"];
  onChange: ComponentProps<typeof StableExploreFilters>["onSearchOptionsChange"]; onClear: () => void; count: number;
}) {
  const [close, setClose] = useState(0);
  return <section className="cap-catalog-top-filters" aria-label={t("workspace.filters")}>
    <div className="cap-catalog-top-filter-scroll" onScroll={() => setClose(value => value + 1)}>
      <div className="cap-catalog-top-filter-content">
        <div className="cap-catalog-filter-actions"><span>{t("workspace.activeFilters", { count })}</span>
          <button type="button" disabled={!count} onClick={onClear}>{t("explore.clearFilters")}</button></div>
        <StableExploreFilters compactTime search={search} availableFormats={availableFormats} detailDomains={detailDomains} metadataDisabled={attributes.disabled} metadataColorsDisabled={attributes.colorsDisabled}
          closeFlyoutRequest={close} onFlyoutOpen={() => {}} onSearchOptionsChange={onChange} />
      </div>
    </div>
  </section>;
}
