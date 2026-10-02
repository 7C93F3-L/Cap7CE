import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import { t } from "../../../electron/localization";
import type { AppearanceColors, ResolvedThemeMode, WindowMaterial } from "../../shared/types";
import ResponsiveFileContextMenu, { type ResponsiveFileContextMenuItem } from "../components/ResponsiveFileContextMenu";
import { fileContextShortcutLabels } from "../fileContextActions";
import { getFileContextMenuStyle } from "../fileContextMenuShared";
import { formatCacheSize } from "../formatting";

export type ComputerSearchContextMenuState = {
  x: number;
  y: number;
  item: ComputerSearchItem;
  items: ComputerSearchItem[];
};

type ResultAction = "preview" | "open" | "showInFolder" | "copyPaths";

const ComputerSearchResultContextMenu = ({
  state, theme, appearanceColors, windowMaterial, onClose, onAction
}: {
  state: ComputerSearchContextMenuState;
  theme: ResolvedThemeMode;
  appearanceColors: AppearanceColors;
  windowMaterial: WindowMaterial;
  onClose: () => void;
  onAction: (action: ResultAction) => void;
}) => {
  const action = (id: ResultAction, label: string, shortcut: string): ResponsiveFileContextMenuItem => ({
    id, label, shortcut, onSelect: () => onAction(id)
  });
  const format = state.item.isDirectory
    ? t("fileInfo.folder")
    : state.item.extension.replace(/^\./, "").toUpperCase() || t("fileInfo.file");
  const detail = state.item.isDirectory ? t("fileInfo.folder") : formatCacheSize(state.item.sizeBytes ?? 0);
  return <ResponsiveFileContextMenu
    x={state.x}
    y={state.y}
    theme={theme}
    menuStyle={getFileContextMenuStyle(theme, appearanceColors, windowMaterial)}
    format={format}
    fileName={state.item.name}
    detail={detail}
    actionGroups={[
      [
        action("preview", t("skim.preview"), fileContextShortcutLabels.primaryView),
        action("open", t("skim.openItem"), fileContextShortcutLabels.open),
        action("showInFolder", t("skim.openPath"), fileContextShortcutLabels.showInFolder)
      ],
      [action("copyPaths", state.items.length > 1
        ? t("context.copySelectedPaths", { count: state.items.length })
        : t("context.copyPath"), fileContextShortcutLabels.copyPaths)]
    ]}
    onClose={onClose}
  />;
};

export default ComputerSearchResultContextMenu;
