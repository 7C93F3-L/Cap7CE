import type { RefObject } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import SvgIcon from "../components/SvgIcon";
import { getFormatIconSvgByName } from "../formatIcons";
import StableUiIcon from "../stable-ui/StableUiIcon";
import { useViewportThumbnail } from "./useViewportThumbnail";

const ComputerSearchResultVisual = ({ item, taskId, scrollContainerRef, foreground = true }: {
  item: ComputerSearchItem;
  taskId: string;
  foreground?: boolean;
  scrollContainerRef: RefObject<HTMLElement | null>;
}) => {
  const thumbnail = useViewportThumbnail(taskId, item.authorizationId, foreground, scrollContainerRef);
  return <span className={`cap-skim-entry-visual cap-computer-search-visual${item.isDirectory ? " is-folder" : ""}`} ref={thumbnail.visualRef}>
    {item.isDirectory
      ? <StableUiIcon name="folder" className="cap-skim-entry-icon" />
      : <SvgIcon svg={getFormatIconSvgByName(item.iconName)} className="cap-svg-icon cap-skim-entry-icon" />}
    {thumbnail.url && <img
      className="cap-skim-entry-thumbnail"
      src={thumbnail.url}
      alt=""
      draggable={false}
      onError={thumbnail.fail}
    />}
  </span>;
};

export default ComputerSearchResultVisual;
