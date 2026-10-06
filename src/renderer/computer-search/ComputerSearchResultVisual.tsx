import { useLayoutEffect, useRef, type RefObject } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import SvgIcon from "../components/SvgIcon";
import { getFormatIconSvgByName } from "../formatIcons";
import skimFolderSvg from "../assets/icons/skim-folder.svg?raw";
import { useViewportThumbnail } from "./useViewportThumbnail";
import { TwoLineMiddleEllipsisFileName } from "../components/MiddleEllipsisFileName";
import { VideoThumbnailIndicator, videoThumbnailExtensions } from "../results/ResultThumbnail";
import { getThumbnailSourceKey } from "./viewportThumbnailImage";

const ComputerSearchResultVisual = ({ item, taskId, scrollContainerRef, foreground = true }: {
  item: ComputerSearchItem;
  taskId: string;
  foreground?: boolean;
  scrollContainerRef: RefObject<HTMLElement | null>;
}) => {
  const thumbnail = useViewportThumbnail(taskId, item.authorizationId, foreground, scrollContainerRef, getThumbnailSourceKey(item));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useLayoutEffect(() => {
    const target = canvasRef.current, image = thumbnail.image;
    if (!target || !image) return;
    target.width = image.width; target.height = image.height;
    target.getContext("2d")?.drawImage(image, 0, 0);
  }, [thumbnail.image]);
  return <span className="cap-computer-search-thumbnail-visual" ref={thumbnail.visualRef}>
    {!thumbnail.image && <span className="result-file-card">
      {item.isDirectory
        ? <SvgIcon svg={skimFolderSvg} className="cap-svg-icon result-file-card-icon" />
        : <SvgIcon svg={getFormatIconSvgByName(item.iconName)} className="cap-svg-icon result-file-card-icon" />}
      <TwoLineMiddleEllipsisFileName fileName={item.name} className="result-file-card-name" />
    </span>}
    {thumbnail.image && <><span className="thumbnail-image-frame"><canvas ref={canvasRef} aria-hidden="true" /></span>
      {videoThumbnailExtensions.has(item.extension.toLowerCase()) && <VideoThumbnailIndicator />}</>}
  </span>;
};

export default ComputerSearchResultVisual;
