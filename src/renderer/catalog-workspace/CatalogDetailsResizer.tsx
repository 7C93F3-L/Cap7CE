import type { useCatalogDetailsWidth } from "./useCatalogDetailsWidth";

export default function CatalogDetailsResizer({ layout }: { layout: ReturnType<typeof useCatalogDetailsWidth> }) {
  return <div className="cap-catalog-resizer cap-catalog-details-resizer" role="separator" aria-label="详细信息栏宽度"
    aria-orientation="vertical" aria-valuenow={Math.round(layout.width)} aria-valuemin={layout.minWidth} aria-valuemax={layout.maxWidth}
    data-selection-preserve="true" tabIndex={0} onPointerDown={layout.startResize} onDoubleClick={layout.resetWidth}
    onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); layout.resizeKey(event.key); } }} />;
}
