import type { RefObject } from "react";
import { t } from "../../../electron/localization";
import type { CatalogGridMode } from "../../shared/catalogPresentationTypes";
import ChevronIcon from "../components/ChevronIcon";
import CatalogVirtualGrid from "../computer-search/CatalogVirtualGrid";
import CatalogTile from "../computer-search/CatalogTile";
import CatalogIconVisual from "../computer-search/CatalogIconVisual";

export interface CatalogHomeEntry { id: string; path: string; name: string; icon: string }

export default function CatalogHomeGroup({ title, items, collapsed, onToggle, rootRef, mode, size = 100, selectedPath, onSelect, onOpen }: {
  title: string; items: CatalogHomeEntry[]; collapsed: boolean; onToggle: () => void;
  rootRef: RefObject<HTMLElement>; mode: CatalogGridMode; size?: number; selectedPath: string | null;
  onSelect: (path: string | null) => void; onOpen: (path: string) => void;
}) {
  return <section className={`cap-skim-root-group${collapsed ? " is-collapsed" : ""}`}>
    <button className="cap-skim-root-group-header" type="button" aria-expanded={!collapsed}
      title={`${t(collapsed ? "common.expand" : "common.collapse")} ${title}`}
      onClick={event => { event.stopPropagation(); onToggle(); }}>
      <span>{title}</span><ChevronIcon className="cap-skim-root-group-chevron" />
    </button>
    {!collapsed && <CatalogVirtualGrid items={items} mode={mode} size={size} rootRef={rootRef} renderItem={(item, style) =>
      <CatalogTile key={item.id} className="cap-skim-root-entry" selected={selectedPath === item.path}
        active={selectedPath === item.path} style={style} title={item.path} aria-label={item.name}
        onClick={event => { event.stopPropagation(); onSelect(item.path); }}
        onDoubleClick={() => onOpen(item.path)} onKeyDown={event => {
          if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.shiftKey) {
            event.preventDefault(); onOpen(item.path);
          }
        }}><CatalogIconVisual icon={item.icon} name={item.name} /></CatalogTile>} />}
  </section>;
}
