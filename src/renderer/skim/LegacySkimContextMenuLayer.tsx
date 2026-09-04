import { t } from "../../../electron/localization";
import type { AppearanceColors } from "../../shared/types";
import type { FileContextMenuAction } from "../../shared/fileContextMenuTypes";
import { buildFileContextMenuGroups, fileContextShortcutLabels } from "../fileContextActions";
import { formatCacheSize } from "../formatting";
import ImageContextMenu, { getImageContextMenuStyle } from "../ImageContextMenu";
import type { SkimContextMenuState } from "./SkimView";
import useSkimContextMenuMetadata from "./useSkimContextMenuMetadata";

interface LegacySkimContextMenuLayerProps {
  state: SkimContextMenuState;
  theme: "light" | "dark";
  appearanceColors: AppearanceColors;
  compact: boolean;
  isAddingDirectory: boolean;
  sidebarAction: "add" | "remove" | "unavailable";
  onAction: (action: FileContextMenuAction) => void;
}

const LegacySkimContextMenuLayer = ({ state, theme, appearanceColors, compact, isAddingDirectory, sidebarAction, onAction }: LegacySkimContextMenuLayerProps) => {
  const { dimensions, folderStats } = useSkimContextMenuMetadata(state);
  return <ImageContextMenu
    x={state.x} y={state.y} theme={theme} menuStyle={getImageContextMenuStyle(theme, appearanceColors)} compact={compact}
    header={{
      format: state.item.kind === "folder" ? t("fileInfo.folder") : state.item.extension.slice(1).toUpperCase() || t("fileInfo.file"),
      fileName: state.item.label || state.item.name, filePath: state.item.path, sourceFileName: state.item.name,
      primaryDetail: state.item.kind === "folder" ? folderStats ? t("fileInfo.size", { size: formatCacheSize(folderStats.totalSize) }) : undefined : t("fileInfo.size", { size: formatCacheSize(state.item.size ?? 0) }),
      details: state.item.kind === "folder"
        ? folderStats ? [t("fileInfo.compactContents", { files: folderStats.fileCount, folders: folderStats.folderCount })] : [t("fileInfo.calculating")]
        : dimensions ? [t("fileInfo.resolution", dimensions)] : []
    }}
    groups={buildFileContextMenuGroups({
      viewLabel: t("context.view"), actionsLabel: t("context.actions"),
      primaryViewAction: { id: "preview", label: t("skim.preview"), onSelect: () => onAction("preview") },
      openAction: { id: "open", label: t("skim.openItem"), onSelect: () => onAction("open") },
      showInFolderAction: { id: "showInFolder", label: t("skim.openPath"), onSelect: () => onAction("showInFolder") },
      copyPathsAction: { id: "copyPaths", label: state.items.length > 1 ? t("context.copySelectedPaths", { count: state.items.length }) : t("context.copyPath"), onSelect: () => onAction("copyPaths") },
      additionalActions: [
        { id: "addDirectory", label: t("skim.addDirectory"), shortcut: fileContextShortcutLabels.addDirectory, disabled: isAddingDirectory, onSelect: () => onAction("addDirectory") },
        { id: "addToSidebar", label: sidebarAction === "add" ? t("skim.sidebar.add") : sidebarAction === "remove" ? t("skim.sidebar.remove") : t("skim.sidebar.alreadyAdded"), shortcut: fileContextShortcutLabels.addToSidebar, disabled: sidebarAction === "unavailable", onSelect: () => onAction("addToSidebar") }
      ]
    })}
  />;
};

export default LegacySkimContextMenuLayer;
