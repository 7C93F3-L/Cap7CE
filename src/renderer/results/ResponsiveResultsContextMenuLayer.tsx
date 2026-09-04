import type { CSSProperties } from "react";
import { t } from "../../../electron/localization";
import ResponsiveFileContextMenu from "../components/ResponsiveFileContextMenu";
import { fileContextShortcutLabels } from "../fileContextActions";
import { formatCacheSize } from "../formatting";
import type { ResultsContextMenuLayerProps } from "./ResultsContextMenuLayer";

const ResponsiveResultsContextMenuLayer = ({ state, theme, menuStyle, onClose, onOpen, onShowInFolder, onCopyPaths, onEditKeywords, onDelete }: ResultsContextMenuLayerProps & { theme: "light" | "dark"; menuStyle: CSSProperties }) => {
  const dimensions = state.item.imageWidth > 0 && state.item.imageHeight > 0 ? `${state.item.imageWidth} × ${state.item.imageHeight}` : null;
  const action = (id: "preview" | "open" | "showInFolder" | "copyPaths" | "editKeywords" | "delete", label: string, shortcut: string, onSelect: () => void) => ({ id, label, shortcut, onSelect });
  return <ResponsiveFileContextMenu
    x={state.x} y={state.y} theme={theme} menuStyle={menuStyle}
    format={state.item.extension.slice(1).toUpperCase() || t("fileInfo.file")}
    fileName={state.item.fileName}
    detail={[dimensions, formatCacheSize(state.item.fileSize)].filter(Boolean).join(" · ")}
    actionGroups={[
      [
        action("preview", t("preview.action"), fileContextShortcutLabels.primaryView, state.preview),
        action("open", t("context.open"), fileContextShortcutLabels.open, () => onOpen(state.item)),
        action("showInFolder", t("context.showInFolder"), fileContextShortcutLabels.showInFolder, () => onShowInFolder(state.item))
      ],
      [
        action("copyPaths", state.items.length > 1 ? t("context.copySelectedPaths", { count: state.items.length }) : t("context.copyPath"), fileContextShortcutLabels.copyPaths, () => onCopyPaths(state.items)),
        action("editKeywords", t("context.editKeywords"), t("context.holdSpaceShortcut"), () => onEditKeywords(state.items)),
        action("delete", state.items.length > 1 ? t("context.deleteSelectedFiles", { count: state.items.length }) : t("context.deleteFile"), fileContextShortcutLabels.delete, () => onDelete(state.items))
      ]
    ]}
    onClose={onClose}
  />;
};

export default ResponsiveResultsContextMenuLayer;
