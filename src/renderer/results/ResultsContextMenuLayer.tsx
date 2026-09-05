import type { CSSProperties } from "react";
import type { ImageIndexItem } from "../../shared/types";
import ResponsiveResultsContextMenuLayer from "./ResponsiveResultsContextMenuLayer";

export interface ResultsContextMenuState {
  x: number;
  y: number;
  item: ImageIndexItem;
  items: ImageIndexItem[];
  preview: () => void;
}

export interface ResultsContextMenuLayerProps {
  state: ResultsContextMenuState;
  onClose: () => void;
  onOpen: (item: ImageIndexItem) => void;
  onShowInFolder: (item: ImageIndexItem) => void;
  onCopyPaths: (items: ImageIndexItem[]) => void;
  onEditKeywords: (items: ImageIndexItem[]) => void;
  onDelete: (items: ImageIndexItem[]) => void;
}

interface ResultsContextMenuAdapterProps extends ResultsContextMenuLayerProps {
  theme: "light" | "dark";
  menuStyle: CSSProperties;
}

const ResultsContextMenuLayer = (props: ResultsContextMenuAdapterProps) => <ResponsiveResultsContextMenuLayer {...props} />;

export default ResultsContextMenuLayer;
