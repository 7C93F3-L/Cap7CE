import { useRef, useState, type ComponentProps } from "react";
import StableExploreFilters from "../stable-ui/StableExploreFilters";
import type { useCatalogAttributeAvailability } from "./useCatalogAttributeAvailability";
import { t } from "../../../electron/localization";
import "./CatalogTopFilters.css";
import CatalogAttributeNotice from "./CatalogAttributeNotice";
import { createPortal } from "react-dom";
import type { MetadataBuildProgress } from "../../shared/metadataBuildTypes";
import { useCatalogAttributeHelp } from "./useCatalogAttributeHelp";
import { useHorizontalFilterScroll } from "./useHorizontalFilterScroll";
import { StableFlyoutBoundaryContext } from "../stable-ui/StableSidebarFlyout";

export default function CatalogTopFilters({ search, availableFormats, detailDomains, onChange, onClear, count, attributes, onMetadata, path = null, noticeHost, metadataProgress }: {
  attributes: ReturnType<typeof useCatalogAttributeAvailability>;
  search: ComponentProps<typeof StableExploreFilters>["search"];
  availableFormats: string[]; detailDomains?: ComponentProps<typeof StableExploreFilters>["detailDomains"];
  onChange: ComponentProps<typeof StableExploreFilters>["onSearchOptionsChange"]; onClear: () => void; count: number;
  onMetadata?: () => void;
  path?: string | null; noticeHost?: HTMLElement | null; metadataProgress?: MetadataBuildProgress | null;
}) {
  const help = useCatalogAttributeHelp(JSON.stringify([path, search.selectedExtensions]), path, attributes.state,
    attributes.disabled || attributes.colorsDisabled, metadataProgress, onMetadata);
  const [close, setClose] = useState(0);
  const scrollRef = useHorizontalFilterScroll();
  const boundaryRef = useRef<HTMLElement>(null);
  return <StableFlyoutBoundaryContext.Provider value={boundaryRef}><section ref={boundaryRef} className="cap-catalog-top-filters" aria-label={t("workspace.filters")}>
    <div ref={scrollRef} className="cap-catalog-top-filter-scroll" tabIndex={0} onScroll={() => setClose(value => value + 1)}>
      <div className="cap-catalog-top-filter-content">
        <div className="cap-catalog-filter-actions"><span>{t("workspace.filterSummary", { count })}</span>
          <button type="button" disabled={!count} onClick={onClear}>{t("explore.clearFilters")}</button></div>
        <StableExploreFilters compactTime allowUnclassified fileTypeIcons search={search} availableFormats={availableFormats} detailDomains={detailDomains} metadataDisabled={attributes.disabled} metadataColorsDisabled={attributes.colorsDisabled}
          onMetadataUnavailable={noticeHost && onMetadata ? help.request : undefined}
          closeFlyoutRequest={close} onFlyoutOpen={() => {}} onSearchOptionsChange={onChange} />
      </div>
    </div>
    {help.shown && noticeHost && createPortal(<CatalogAttributeNotice {...help.notice} />, noticeHost)}
  </section></StableFlyoutBoundaryContext.Provider>;
}
