import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import { t } from "../../../electron/localization";
import type { AppearanceColors, ResolvedThemeMode, WindowMaterial } from "../../shared/types";
import ResponsiveFileContextMenu, { type ResponsiveFileContextMenuItem } from "../components/ResponsiveFileContextMenu";
import { fileContextShortcutLabels } from "../fileContextActions";
import { getFileContextMenuStyle } from "../fileContextMenuShared";
import "./ComputerSearchContextMenu.css";

export type ComputerSearchContextMenuState = {
  x: number;
  y: number;
  item: ComputerSearchItem;
  items: ComputerSearchItem[];
};

type ResultAction = "preview" | "open" | "showInFolder" | "copyPaths" | "delete" | "addToSidebar";

const ComputerSearchResultContextMenu = ({
  state, theme, appearanceColors, windowMaterial, onClose, onAction, favoriteAction, favoriteBusy = false
}: {
  state: ComputerSearchContextMenuState;
  theme: ResolvedThemeMode;
  appearanceColors: AppearanceColors;
  windowMaterial: WindowMaterial;
  onClose: () => void;
  onAction: (action: ResultAction) => void;
  favoriteAction?: "add" | "remove";
  favoriteBusy?: boolean;
}) => {
  const action = (id: ResultAction, label: string, shortcut: string): ResponsiveFileContextMenuItem => ({
    id, label, shortcut, onSelect: () => onAction(id)
  });
  return <ResponsiveFileContextMenu
    x={state.x}
    y={state.y}
    theme={theme}
    menuStyle={getFileContextMenuStyle(theme, appearanceColors, windowMaterial)}
    format="" showInfo={false}
    fileName={state.item.name}
    detail=""
    actionGroups={[
      [
        action("preview", t("skim.preview"), fileContextShortcutLabels.primaryView),
        action("open", t("skim.openItem"), fileContextShortcutLabels.open),
        action("showInFolder", t("skim.openPath"), fileContextShortcutLabels.showInFolder)
      ],
      [action("copyPaths", state.items.length > 1
        ? t("context.copySelectedPaths", { count: state.items.length })
        : t("context.copyPath"), fileContextShortcutLabels.copyPaths),
        ...(favoriteAction ? [{ ...action("addToSidebar", t(favoriteAction === "add" ? "catalogActions.addFavorite" : "catalogActions.removeFavorite"), ""), disabled: favoriteBusy }] : []),
        action("delete", t("common.delete"), fileContextShortcutLabels.delete)]
    ]}
    onClose={onClose}
  />;
};

export default ComputerSearchResultContextMenu;
