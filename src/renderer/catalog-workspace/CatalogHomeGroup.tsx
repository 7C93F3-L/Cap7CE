import type { RefObject, MouseEvent } from "react";
import type { CatalogGridMode } from "../../shared/catalogPresentationTypes";
import CatalogVirtualGrid from "../computer-search/CatalogVirtualGrid";
import CatalogTile from "../computer-search/CatalogTile";
import CatalogIconVisual from "../computer-search/CatalogIconVisual";

export interface CatalogHomeEntry { id: string; path: string; name: string; icon: string }

export default function CatalogHomeGroup({ title, items, rootRef, mode, size = 100, selectedPath, onSelect, onOpen, onContextMenu }: {
  title: string; items: CatalogHomeEntry[];
  rootRef: RefObject<HTMLElement>; mode: CatalogGridMode; size?: number; selectedPath: string | null;
  onSelect: (path: string | null) => void; onOpen: (path: string) => void;
  onContextMenu?: (event: MouseEvent, item: CatalogHomeEntry) => void;
}) {
  return <section className="cap-skim-root-group">
    <h3 className="cap-catalog-home-group-title">{title}</h3>
    <CatalogVirtualGrid items={items} mode={mode} size={size} rootRef={rootRef} renderItem={(item, style) =>
      <CatalogTile key={item.id} className="cap-skim-root-entry" selected={selectedPath === item.path}
        active={selectedPath === item.path} style={style} title={item.path} aria-label={item.name}
        onContextMenu={onContextMenu ? event => onContextMenu(event, item) : undefined}
        onClick={event => { event.stopPropagation(); onSelect(item.path); }}
        onDoubleClick={() => onOpen(item.path)} onKeyDown={event => {
          if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.shiftKey) {
            event.preventDefault(); onOpen(item.path);
          }
        }}><CatalogIconVisual icon={item.icon} name={item.name} /></CatalogTile>} />
  </section>;
}
