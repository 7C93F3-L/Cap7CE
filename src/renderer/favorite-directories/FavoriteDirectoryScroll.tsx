import { useRef, type ReactNode } from "react";
import CustomScrollbar from "../CustomScrollbar";
import "../CustomScrollbar.css";
import "./FavoriteDirectoryScroll.css";

export default function FavoriteDirectoryScroll({ children, custom }: { children: ReactNode; custom: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  if (!custom) return <div className="cap-favorite-rows">{children}</div>;
  return <div className="cap-favorite-scroll-frame">
    <div ref={scrollRef} className="cap-favorite-rows">{children}</div>
    <div className="cap-favorite-scrollbar" data-selection-preserve="true">
      <CustomScrollbar scrollContainerRef={scrollRef} orientation="vertical" />
    </div>
  </div>;
}
