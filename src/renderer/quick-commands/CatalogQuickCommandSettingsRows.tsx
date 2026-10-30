import { QuickCommandSettingsRows } from "../settings/QuickCommandSettingsRows";
import { getCatalogCommandReference } from "../../../core/node/resourceCatalog/domain/commands/catalogCommandReference";

export function CatalogQuickCommandSettingsRows(_props: { stableUi?: boolean }) {
  return <QuickCommandSettingsRows stableUi {...getCatalogCommandReference()} />;
}
