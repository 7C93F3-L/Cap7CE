import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import { t } from "../../../electron/localization";
import type { AppearanceColors, ResolvedThemeMode, WindowMaterial } from "../../shared/types";
import ResponsiveFileContextMenu, { type ResponsiveFileContextMenuItem } from "../components/ResponsiveFileContextMenu";
import { fileContextShortcutLabels } from "../fileContextActions";
import { getFileContextMenuStyle } from "../fileContextMenuShared";

export type ComputerSearchContextMenuState = {
  x: number;
  y: number;
  item: ComputerSearchItem;
  items: ComputerSearchItem[];
};

type ResultAction = "preview" | "open" | "showInFolder" | "copyPaths" | "delete" | "addToSidebar" | "metadata" | "editKeywords" | "autoKeywords";

const ComputerSearchResultContextMenu = ({
  state, theme, appearanceColors, windowMaterial, onClose, onAction, favoriteAction, favoriteBusy = false, keywordsAvailable = false, keywordsBusy = false
}: {
  state: ComputerSearchContextMenuState;
  theme: ResolvedThemeMode;
  appearanceColors: AppearanceColors;
  windowMaterial: WindowMaterial;
  onClose: () => void;
  onAction: (action: ResultAction) => void;
  favoriteAction?: "add" | "remove";
  favoriteBusy?: boolean;
  keywordsAvailable?: boolean; keywordsBusy?: boolean;
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
        action("open", t("skim.openItem"), fileContextShortcutLabels.open),
        action("preview", t("skim.preview"), fileContextShortcutLabels.primaryView),
        action("showInFolder", t("skim.openPath"), fileContextShortcutLabels.showInFolder),
        action("copyPaths", state.items.length > 1
        ? t("context.copySelectedPaths", { count: state.items.length })
        : t("context.copyPath"), fileContextShortcutLabels.copyPaths),
        action("delete", t("common.delete"), fileContextShortcutLabels.delete),
        ...(favoriteAction ? [{ ...action("addToSidebar", t(favoriteAction === "add" ? "catalogActions.addFavorite" : "catalogActions.removeFavorite"), ""), disabled: favoriteBusy }] : [])
      ],
      [
        ...(keywordsAvailable ? [{ ...action("editKeywords", "编辑关键词", ""), disabled: keywordsBusy || !state.items.some(item => !item.isDirectory) }] : []),
        ...(keywordsAvailable ? [{ ...action("autoKeywords", "自动添加关键词", ""), disabled: keywordsBusy }] : []),
        ...(state.item.isDirectory && state.items.length === 1 ? [action("metadata", t("metadataDirectory.action"), "")] : [])
      ]
    ]}
    onClose={onClose}
  />;
};

export default ComputerSearchResultContextMenu;
