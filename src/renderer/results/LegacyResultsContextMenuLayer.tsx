import type { CSSProperties } from "react";
import { t } from "../../../electron/localization";
import { buildFileContextMenuGroups } from "../fileContextActions";
import { formatCacheSize } from "../formatting";
import ImageContextMenu from "../ImageContextMenu";
import type { ResultsContextMenuLayerProps } from "./ResultsContextMenuLayer";

interface LegacyResultsContextMenuLayerProps extends ResultsContextMenuLayerProps {
  theme: "light" | "dark";
  menuStyle: CSSProperties;
}

const LegacyResultsContextMenuLayer = ({ state, theme, menuStyle, onOpen, onShowInFolder, onCopyPaths, onEditKeywords, onDelete }: LegacyResultsContextMenuLayerProps) => (
  <ImageContextMenu
    key={`results:${state.item.id}:${state.x}:${state.y}`}
    x={state.x} y={state.y} theme={theme} menuStyle={menuStyle}
    compact={state.shellState === "micro" || state.shellState === "mini"}
    header={{
      format: state.item.extension.slice(1).toUpperCase() || t("fileInfo.file"),
      fileName: state.item.fileName, filePath: state.item.filePath,
      primaryDetail: t("fileInfo.size", { size: formatCacheSize(state.item.fileSize) }),
      details: state.item.imageWidth > 0 && state.item.imageHeight > 0
        ? [t("fileInfo.resolution", { width: state.item.imageWidth, height: state.item.imageHeight })] : []
    }}
    groups={buildFileContextMenuGroups({
      viewLabel: t("context.view"), actionsLabel: t("context.actions"),
      primaryViewAction: { id: "preview", label: t("preview.action"), onSelect: state.preview },
      openAction: { id: "open", label: t("context.open"), onSelect: () => onOpen(state.item) },
      showInFolderAction: { id: "showInFolder", label: t("context.showInFolder"), onSelect: () => onShowInFolder(state.item) },
      copyPathsAction: {
        id: "copyPaths",
        label: state.items.length > 1 ? t("context.copySelectedPaths", { count: state.items.length }) : t("context.copyPath"),
        onSelect: () => onCopyPaths(state.items)
      },
      editKeywordsAction: { id: "editKeywords", label: t("context.editKeywords"), onSelect: () => onEditKeywords(state.items) },
      editKeywordsShortcut: t("context.holdSpaceShortcut"),
      deleteAction: {
        id: "delete",
        label: state.items.length > 1 ? t("context.deleteSelectedFiles", { count: state.items.length }) : t("context.deleteFile"),
        onSelect: () => onDelete(state.items)
      }
    })}
  />
);

export default LegacyResultsContextMenuLayer;
