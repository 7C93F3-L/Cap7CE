import { useCallback, useEffect } from "react";
import { t } from "../../../electron/localization";
import { useAlwaysOnTopController } from "../controllers/useAlwaysOnTopController";
import { useContentViewActivity } from "../controllers/useContentViewActivity";
import StableTitlebar from "../stable-ui/StableTitlebar";
import CatalogWorkspace from "./CatalogWorkspace";
import { useCatalogApplicationPreferences } from "./useCatalogApplicationPreferences";
import { useCatalogWindowCommands } from "./useCatalogWindowCommands";
import { useCatalogWindowVisibility } from "./useCatalogWindowVisibility";
import "../stable-ui/StableUiFoundation.css";

const noop = () => {};
export default function CatalogApplicationRoot() {
  const appearance = useCatalogApplicationPreferences();
  const pin = useAlwaysOnTopController();
  const visible = useCatalogWindowVisibility();
  const foreground = useContentViewActivity(noop, visible);
  const commands = useCatalogWindowCommands(appearance.preferences);
  const openSettings = useCallback(() => { void window.cap7ce?.settingsWindow.open(); }, []);
  useEffect(() => { void pin.syncAlwaysOnTop().catch(() => undefined); }, [pin.syncAlwaysOnTop]);
  return <div className={`app theme-${appearance.theme} cap-stable-ui`} data-window-material={appearance.windowMaterial} style={appearance.themeStyle}>
    <StableTitlebar theme={appearance.theme} themeStyle={appearance.themeStyle} windowMaterial={appearance.windowMaterial}
      pinned={pin.isAlwaysOnTop} pinLabel={pin.isAlwaysOnTop ? t("window.unfix") : t("window.fix")}
      interactionLocked={false} resultStatus={null} onTogglePinned={() => void pin.toggleAlwaysOnTop("normal")} />
    <CatalogWorkspace theme={appearance.theme} appearanceColors={appearance.appearanceColors} windowMaterial={appearance.windowMaterial}
      visible={visible} foreground={visible && foreground} onOpenSettings={openSettings} onNativeDragStateChange={commands.reportDrag} onActiveActions={commands.reportActions} />
  </div>;
}
