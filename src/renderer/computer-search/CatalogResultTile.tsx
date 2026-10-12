import { useCallback, useRef, useState, type CSSProperties, type ComponentProps } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import ComputerSearchResultVisual from "./ComputerSearchResultVisual";
import CatalogTile, { type CatalogTileProps } from "./CatalogTile";

export default function CatalogResultTile({ item, visual, onRatio, ...props }: CatalogTileProps & {
  onRatio?: (ratio: number) => void;
  item: ComputerSearchItem; visual: Omit<ComponentProps<typeof ComputerSearchResultVisual>, "item" | "onRatio">;
}) {
  const [ratio, setRatio] = useState<{ path: string; value: number } | null>(null);
  const ratioCallback = useRef(onRatio); ratioCallback.current = onRatio;
  const report = useCallback((value: number) => { ratioCallback.current?.(value); setRatio(previous => previous?.path === item.path && previous.value === value
    ? previous : { path: item.path, value }); }, [item.path]);
  return <CatalogTile {...props} style={{ ...props.style, "--cap-tile-ratio": ratio?.path === item.path ? Math.max(.45, Math.min(2.4, ratio.value)) : 1 } as CSSProperties}>
    <ComputerSearchResultVisual item={item} {...visual} onRatio={report} />
  </CatalogTile>;
}
