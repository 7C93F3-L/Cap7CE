import type { ComponentProps } from "react";

export type CatalogTileProps = ComponentProps<"button"> & { selected?: boolean; active?: boolean };

export default function CatalogTile({ selected = false, active = false, className = "", ...props }: CatalogTileProps) {
  return <button type="button" {...props} aria-pressed={selected}
    className={`thumb ${className}${selected ? " selected" : ""}${active ? " active" : ""}`} />;
}
