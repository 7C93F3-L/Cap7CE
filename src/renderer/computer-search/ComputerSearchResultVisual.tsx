import { useEffect, useRef, useState, type RefObject } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import SvgIcon from "../components/SvgIcon";
import { getFormatIconSvgByName } from "../formatIcons";
import StableUiIcon from "../stable-ui/StableUiIcon";

const ComputerSearchResultVisual = ({ item, taskId, scrollContainerRef }: {
  item: ComputerSearchItem;
  taskId: string;
  scrollContainerRef: RefObject<HTMLElement | null>;
}) => {
  const visualRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setVisible(false);
    setFailed(false);
    const target = visualRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver((records) => {
      if (records.some((record) => record.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { root: scrollContainerRef.current, rootMargin: "120px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [item.authorizationId, scrollContainerRef, taskId]);

  const thumbnailUrl = `cap7ce://computer-search-thumbnail/?task=${encodeURIComponent(taskId)}&authorization=${encodeURIComponent(item.authorizationId)}`;
  return <span className={`cap-skim-entry-visual cap-computer-search-visual${item.isDirectory ? " is-folder" : ""}`} ref={visualRef}>
    {item.isDirectory
      ? <StableUiIcon name="folder" className="cap-skim-entry-icon" />
      : <SvgIcon svg={getFormatIconSvgByName(item.iconName)} className="cap-svg-icon cap-skim-entry-icon" />}
    {visible && !failed && <img
      className="cap-skim-entry-thumbnail"
      src={thumbnailUrl}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />}
  </span>;
};

export default ComputerSearchResultVisual;
