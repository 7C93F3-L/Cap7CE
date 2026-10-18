import { useMetadataBuildNavigation } from "../metadata-build/useMetadataBuildNavigation";
import { useCatalogSidebarWidth } from "./useCatalogSidebarWidth";
import { useCatalogViewport } from "./useCatalogViewport";
import { useCatalogPanelVisibility } from "./useCatalogPanelVisibility";

export function useCatalogLayout() {
  const viewport = useCatalogViewport();
  const sidebar = useCatalogSidebarWidth(viewport.width), panels = useCatalogPanelVisibility(viewport);
  const metadata = useMetadataBuildNavigation();
  return { ...sidebar, ...panels, metadataOpen: false, toggleMetadata: metadata.open, metadataError: metadata.error, dismissMetadataError: metadata.dismiss };
}
