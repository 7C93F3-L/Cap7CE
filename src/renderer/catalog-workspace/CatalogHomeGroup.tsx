import type { RefObject, MouseEvent } from "react";
import type { CatalogGridMode } from "../../shared/catalogPresentationTypes";
import CatalogVirtualGrid from "../computer-search/CatalogVirtualGrid";
import CatalogTile from "../computer-search/CatalogTile";
import CatalogIconVisual from "../computer-search/CatalogIconVisual";

import type { CatalogHomeEntry } from "../../shared/catalogHomeTypes";

export default function CatalogHomeGroup({ title, items, rootRef, mode, size = 100, selectedIds, activeId, onSelect, onOpen, onPreview, foreground, onDrag, onDragEnd, onContextMenu }: {
  title: string; items: CatalogHomeEntry[];
  rootRef: RefObject<HTMLElement>; mode: CatalogGridMode; size?: number; selectedIds: Set<string>; activeId: string | null;
  onSelect: (entry: CatalogHomeEntry, additive?: boolean, range?: boolean) => void; onOpen: (path: string) => void;
  onPreview: (entry: CatalogHomeEntry) => void; foreground: boolean; onDrag: (entry: CatalogHomeEntry) => void; onDragEnd: () => void;
  onContextMenu?: (event: MouseEvent, item: CatalogHomeEntry) => void;
}) {
  return <section className="cap-skim-root-group">
    <h3 className="cap-catalog-home-group-title">{title}</h3>
    <CatalogVirtualGrid items={items} mode={mode} size={size} rootRef={rootRef} renderItem={(item, style) =>
      <CatalogTile key={item.id} className="cap-skim-root-entry" selected={selectedIds.has(item.path)}
        active={activeId === item.path} style={style} title={item.path} aria-label={item.name}
        onContextMenu={onContextMenu ? event => onContextMenu(event, item) : undefined}
        onClick={event => { event.stopPropagation(); onSelect(item, event.ctrlKey || event.metaKey, event.shiftKey); }}
        draggable={item.kind !== "drive"} onDragStart={event => { event.preventDefault(); onDrag(item); }} onDragEnd={onDragEnd}
        onDoubleClick={() => onOpen(item.path)} onKeyDown={event => {
          if (!foreground || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
          if (event.code === "Space") { event.preventDefault(); event.stopPropagation(); if (!event.repeat) onPreview(item); }
          if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.shiftKey) {
            event.preventDefault(); event.stopPropagation(); if (!event.repeat) onOpen(item.path);
          }
        }}><CatalogIconVisual icon={item.icon} name={item.name} /></CatalogTile>} />
  </section>;
}
