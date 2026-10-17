import { useState, type ComponentProps } from "react";
import StableExploreFilters from "../stable-ui/StableExploreFilters";
import type { useCatalogAttributeAvailability } from "./useCatalogAttributeAvailability";
import { t } from "../../../electron/localization";
import "./CatalogTopFilters.css";
import CatalogAttributeNotice from "./CatalogAttributeNotice";
import { useHorizontalFilterScroll } from "./useHorizontalFilterScroll";

export default function CatalogTopFilters({ search, availableFormats, detailDomains, onChange, onClear, count, attributes, onMetadata }: {
  attributes: ReturnType<typeof useCatalogAttributeAvailability>;
  search: ComponentProps<typeof StableExploreFilters>["search"];
  availableFormats: string[]; detailDomains?: ComponentProps<typeof StableExploreFilters>["detailDomains"];
  onChange: ComponentProps<typeof StableExploreFilters>["onSearchOptionsChange"]; onClear: () => void; count: number;
  onMetadata?: () => void;
}) {
  const [close, setClose] = useState(0);
  const scrollRef = useHorizontalFilterScroll();
  return <section className="cap-catalog-top-filters" aria-label={t("workspace.filters")}>
    <div ref={scrollRef} className="cap-catalog-top-filter-scroll" tabIndex={0} onScroll={() => setClose(value => value + 1)}>
      <div className="cap-catalog-top-filter-content">
        <div className="cap-catalog-filter-actions"><span>{t("workspace.filterSummary", { count })}</span>
          <button type="button" disabled={!count} onClick={onClear}>{t("explore.clearFilters")}</button></div>
        <StableExploreFilters compactTime allowUnclassified fileTypeIcons search={search} availableFormats={availableFormats} detailDomains={detailDomains} metadataDisabled={attributes.disabled} metadataColorsDisabled={attributes.colorsDisabled}
          metadataNotice={attributes.message && onMetadata ? <CatalogAttributeNotice message={attributes.message} onMetadata={onMetadata} /> : undefined}
          closeFlyoutRequest={close} onFlyoutOpen={() => {}} onSearchOptionsChange={onChange} />
      </div>
    </div>
  </section>;
}
