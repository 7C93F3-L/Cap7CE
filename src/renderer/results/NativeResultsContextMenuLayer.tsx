import { t } from "../../../electron/localization";
import type { NativeFileContextMenuRequest } from "../../../electron/nativeFileContextMenuTypes";
import NativeFileContextMenuLayer from "../components/NativeFileContextMenuLayer";
import { formatCacheSize } from "../formatting";
import type { ResultsContextMenuLayerProps } from "./ResultsContextMenuLayer";

const buildRequest = ({ item, items }: ResultsContextMenuLayerProps["state"]): NativeFileContextMenuRequest => {
  const format = item.extension.slice(1).toUpperCase() || t("fileInfo.file");
  const dimensions = item.imageWidth > 0 && item.imageHeight > 0 ? `${item.imageWidth} × ${item.imageHeight}` : null;
  return {
    fileName: item.fileName,
    summary: [format, dimensions, formatCacheSize(item.fileSize)].filter(Boolean).join(" · "),
    items: [
      { id: "preview", label: t("preview.action") },
      { id: "open", label: t("context.open") },
      { id: "showInFolder", label: t("context.showInFolder") },
      { id: "copyPaths", label: items.length > 1 ? t("context.copySelectedPaths", { count: items.length }) : t("context.copyPath"), separatorBefore: true },
      { id: "editKeywords", label: t("context.editKeywords") },
      { id: "delete", label: items.length > 1 ? t("context.deleteSelectedFiles", { count: items.length }) : t("context.deleteFile") }
    ]
  };
};

const NativeResultsContextMenuLayer = ({ state, onClose, onOpen, onShowInFolder, onCopyPaths, onEditKeywords, onDelete }: ResultsContextMenuLayerProps) => (
  <NativeFileContextMenuLayer request={buildRequest(state)} onClose={onClose} onAction={(action) => {
      if (action === "preview") state.preview();
      else if (action === "open") onOpen(state.item);
      else if (action === "showInFolder") onShowInFolder(state.item);
      else if (action === "copyPaths") onCopyPaths(state.items);
      else if (action === "editKeywords") onEditKeywords(state.items);
      else if (action === "delete") onDelete(state.items);
  }} />
);

export default NativeResultsContextMenuLayer;
