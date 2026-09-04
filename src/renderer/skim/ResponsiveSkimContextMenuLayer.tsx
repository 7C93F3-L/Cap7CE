import { t } from "../../../electron/localization";
import type { AppearanceColors } from "../../shared/types";
import type { FileContextMenuAction } from "../../shared/fileContextMenuTypes";
import ResponsiveFileContextMenu, { type ResponsiveFileContextMenuItem } from "../components/ResponsiveFileContextMenu";
import { fileContextShortcutLabels } from "../fileContextActions";
import { formatCacheSize } from "../formatting";
import { getImageContextMenuStyle } from "../ImageContextMenu";
import type { SkimContextMenuState } from "./SkimView";
import useSkimContextMenuMetadata from "./useSkimContextMenuMetadata";

interface ResponsiveSkimContextMenuLayerProps {
  state: SkimContextMenuState;
  theme: "light" | "dark";
  appearanceColors: AppearanceColors;
  isAddingDirectory: boolean;
  sidebarAction: "add" | "remove" | "unavailable";
  onClose: () => void;
  onAction: (action: FileContextMenuAction) => void;
}

const ResponsiveSkimContextMenuLayer = ({ state, theme, appearanceColors, isAddingDirectory, sidebarAction, onClose, onAction }: ResponsiveSkimContextMenuLayerProps) => {
  const { dimensions, folderStats } = useSkimContextMenuMetadata(state);
  const action = (id: FileContextMenuAction, label: string, shortcut: string, disabled = false): ResponsiveFileContextMenuItem => ({
    id, label, shortcut, disabled, onSelect: () => onAction(id)
  });
  const detail = state.item.kind === "folder"
    ? folderStats
      ? `${t("fileInfo.compactContents", { files: folderStats.fileCount, folders: folderStats.folderCount })} · ${formatCacheSize(folderStats.totalSize)}`
      : t("fileInfo.calculating")
    : [dimensions ? `${dimensions.width} × ${dimensions.height}` : null, formatCacheSize(state.item.size ?? 0)].filter(Boolean).join(" · ");

  return <ResponsiveFileContextMenu
    x={state.x} y={state.y} theme={theme} menuStyle={getImageContextMenuStyle(theme, appearanceColors)}
    format={state.item.kind === "folder" ? t("fileInfo.folder") : state.item.extension.slice(1).toUpperCase() || t("fileInfo.file")}
    fileName={state.item.label || state.item.name}
    detail={detail}
    actionGroups={[
      [
        action("preview", t("skim.preview"), fileContextShortcutLabels.primaryView),
        action("open", t("skim.openItem"), fileContextShortcutLabels.open),
        action("showInFolder", t("skim.openPath"), fileContextShortcutLabels.showInFolder)
      ],
      [
        action("copyPaths", state.items.length > 1 ? t("context.copySelectedPaths", { count: state.items.length }) : t("context.copyPath"), fileContextShortcutLabels.copyPaths),
        action("addDirectory", t("skim.addDirectory"), fileContextShortcutLabels.addDirectory, isAddingDirectory),
        action("addToSidebar", sidebarAction === "add" ? t("skim.sidebar.add") : sidebarAction === "remove" ? t("skim.sidebar.remove") : t("skim.sidebar.alreadyAdded"), fileContextShortcutLabels.addToSidebar, sidebarAction === "unavailable")
      ]
    ]}
    onClose={onClose}
  />;
};

export default ResponsiveSkimContextMenuLayer;
