import { useCallback, useState, type CSSProperties, type ComponentProps } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import ComputerSearchResultVisual from "./ComputerSearchResultVisual";

export default function CatalogResultTile({ item, visual, ...props }: ComponentProps<"button"> & {
  item: ComputerSearchItem; visual: Omit<ComponentProps<typeof ComputerSearchResultVisual>, "item" | "onRatio">;
}) {
  const [ratio, setRatio] = useState<{ path: string; value: number } | null>(null);
  const report = useCallback((value: number) => setRatio(previous => previous?.path === item.path && previous.value === value
    ? previous : { path: item.path, value }), [item.path]);
  return <button {...props} style={{ "--cap-tile-ratio": ratio?.path === item.path ? Math.max(.45, Math.min(2.4, ratio.value)) : 1 } as CSSProperties}>
    <ComputerSearchResultVisual item={item} {...visual} onRatio={report} />
  </button>;
}
