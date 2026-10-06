import type { RefObject } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import SvgIcon from "../components/SvgIcon";
import { getFormatIconSvgByName } from "../formatIcons";
import StableUiIcon from "../stable-ui/StableUiIcon";
import { useViewportThumbnail } from "./useViewportThumbnail";
import { TwoLineMiddleEllipsisFileName } from "../components/MiddleEllipsisFileName";
import { VideoThumbnailIndicator, videoThumbnailExtensions } from "../results/ResultThumbnail";

const ComputerSearchResultVisual = ({ item, taskId, scrollContainerRef, foreground = true }: {
  item: ComputerSearchItem;
  taskId: string;
  foreground?: boolean;
  scrollContainerRef: RefObject<HTMLElement | null>;
}) => {
  const thumbnail = useViewportThumbnail(taskId, item.authorizationId, foreground, scrollContainerRef);
  return <span className="cap-computer-search-thumbnail-visual" ref={thumbnail.visualRef}>
    {!thumbnail.url && <span className="result-file-card">
      {item.isDirectory
        ? <StableUiIcon name="folder" className="result-file-card-icon" />
        : <SvgIcon svg={getFormatIconSvgByName(item.iconName)} className="cap-svg-icon result-file-card-icon" />}
      <TwoLineMiddleEllipsisFileName fileName={item.name} className="result-file-card-name" />
    </span>}
    {thumbnail.url && <><span className="thumbnail-image-frame"><img
      src={thumbnail.url}
      alt=""
      draggable={false}
      onError={thumbnail.fail}
    /></span>{videoThumbnailExtensions.has(item.extension.toLowerCase()) && <VideoThumbnailIndicator />}</>}
  </span>;
};

export default ComputerSearchResultVisual;
