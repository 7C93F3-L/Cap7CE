import { useEffect, useState } from "react";
import { useCatalogSidebarWidth } from "./useCatalogSidebarWidth";
import { useCatalogViewport } from "./useCatalogViewport";
import { useCatalogPanelVisibility } from "./useCatalogPanelVisibility";

export function useCatalogLayout() {
  const viewport = useCatalogViewport();
  const sidebar = useCatalogSidebarWidth(viewport.width), panels = useCatalogPanelVisibility(viewport);
  const [metadataOpen, setMetadataOpen] = useState(false);
  useEffect(() => window.cap7ce?.settingsWindow?.onMetadataBuildRequested?.(() => setMetadataOpen(true)), []);
  return { ...sidebar, ...panels, metadataOpen, toggleMetadata: () => setMetadataOpen(value => !value) };
}
