import type { CSSProperties } from "react";
import { t } from "../../../electron/localization";
import type { ImageIndexItem } from "../../shared/types";
import { buildFileContextMenuGroups } from "../fileContextActions";
import { formatCacheSize } from "../formatting";
import ImageContextMenu from "../ImageContextMenu";

export interface ResultsContextMenuState {
  x: number;
  y: number;
  item: ImageIndexItem;
  items: ImageIndexItem[];
  preview: () => void;
  shellState: "standby" | "capsule" | "micro" | "mini" | "normal" | "settings";
}

interface ResultsContextMenuLayerProps {
  state: ResultsContextMenuState;
  theme: "light" | "dark";
  menuStyle: CSSProperties;
  onOpen: (item: ImageIndexItem) => void;
  onShowInFolder: (item: ImageIndexItem) => void;
  onCopyPaths: (items: ImageIndexItem[]) => void;
  onEditKeywords: (items: ImageIndexItem[]) => void;
  onDelete: (items: ImageIndexItem[]) => void;
}

const ResultsContextMenuLayer = ({ state, theme, menuStyle, onOpen, onShowInFolder, onCopyPaths, onEditKeywords, onDelete }: ResultsContextMenuLayerProps) => (
  <ImageContextMenu
    key={`results:${state.item.id}:${state.x}:${state.y}`}
    x={state.x}
    y={state.y}
    theme={theme}
    menuStyle={menuStyle}
    compact={state.shellState === "micro" || state.shellState === "mini"}
    header={{
      format: state.item.extension.slice(1).toUpperCase() || t("fileInfo.file"),
      fileName: state.item.fileName,
      filePath: state.item.filePath,
      primaryDetail: t("fileInfo.size", { size: formatCacheSize(state.item.fileSize) }),
      details: state.item.imageWidth > 0 && state.item.imageHeight > 0
        ? [t("fileInfo.resolution", { width: state.item.imageWidth, height: state.item.imageHeight })]
        : []
    }}
    groups={buildFileContextMenuGroups({
      viewLabel: t("context.view"),
      actionsLabel: t("context.actions"),
      primaryViewAction: { id: "preview", label: t("preview.action"), onSelect: state.preview },
      openAction: { id: "open", label: t("context.open"), onSelect: () => onOpen(state.item) },
      showInFolderAction: { id: "showInFolder", label: t("context.showInFolder"), onSelect: () => onShowInFolder(state.item) },
      copyPathsAction: {
        id: "copyPaths",
        label: state.items.length > 1 ? t("context.copySelectedPaths", { count: state.items.length }) : t("context.copyPath"),
        onSelect: () => onCopyPaths(state.items)
      },
      editKeywordsAction: state.items.length > 0
        ? { id: "editKeywords", label: t("context.editKeywords"), onSelect: () => onEditKeywords(state.items) }
        : undefined,
      editKeywordsShortcut: t("context.holdSpaceShortcut"),
      deleteAction: state.items.length > 0
        ? {
          id: "delete",
          label: state.items.length > 1 ? t("context.deleteSelectedFiles", { count: state.items.length }) : t("context.deleteFile"),
          onSelect: () => onDelete(state.items)
        }
        : undefined
    })}
  />
);

export default ResultsContextMenuLayer;
