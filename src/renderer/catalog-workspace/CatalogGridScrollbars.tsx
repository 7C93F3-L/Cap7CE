import type { RefObject } from "react";
import CustomScrollbar from "../CustomScrollbar";
import { useCatalogGridWheel } from "./useCatalogGridWheel";
import "../CustomScrollbar.css";
import "./CatalogGridScrollbars.css";

export default function CatalogGridScrollbars({ scrollContainerRef }: { scrollContainerRef: RefObject<HTMLElement | null> }) {
  useCatalogGridWheel(scrollContainerRef);
  return <div className="cap-catalog-grid-scrollbars" data-selection-preserve="true">
    <CustomScrollbar scrollContainerRef={scrollContainerRef} orientation="vertical" />
    <CustomScrollbar scrollContainerRef={scrollContainerRef} orientation="horizontal" />
  </div>;
}
