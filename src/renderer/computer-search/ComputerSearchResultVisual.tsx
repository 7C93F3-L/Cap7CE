import { useLayoutEffect, useRef, type RefObject } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import CatalogIconVisual from "./CatalogIconVisual";
import CatalogName from "./CatalogName";
import { getFormatIconSvgByName } from "../formatIcons";
import skimFolderSvg from "../assets/icons/skim-folder.svg?raw";
import { useViewportThumbnail } from "./useViewportThumbnail";
import { VideoThumbnailIndicator, videoThumbnailExtensions } from "../results/ResultThumbnail";
import { getThumbnailSourceKey } from "./viewportThumbnailImage";

const ComputerSearchResultVisual = ({ item, taskId, scrollContainerRef, foreground = true, showName = false, onRatio }: {
  item: ComputerSearchItem;
  taskId: string;
  foreground?: boolean;
  scrollContainerRef: RefObject<HTMLElement | null>;
  showName?: boolean;
  onRatio?: (ratio: number) => void;
}) => {
  const thumbnail = useViewportThumbnail(taskId, item.authorizationId, foreground, scrollContainerRef, getThumbnailSourceKey(item));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useLayoutEffect(() => {
    const target = canvasRef.current, image = thumbnail.image;
    if (!target || !image) return;
    target.width = image.width; target.height = image.height;
    target.getContext("2d")?.drawImage(image, 0, 0);
    onRatio?.(image.width / image.height);
  }, [thumbnail.image, onRatio]);
  return <span className="cap-computer-search-thumbnail-visual" ref={thumbnail.visualRef}>
    {!thumbnail.image && <CatalogIconVisual name={item.name} isFile={!item.isDirectory}
      icon={item.isDirectory ? skimFolderSvg : getFormatIconSvgByName(item.iconName)} />}
    {thumbnail.image && <><span className="thumbnail-image-frame"><canvas ref={canvasRef} aria-hidden="true" /></span>
      {videoThumbnailExtensions.has(item.extension.toLowerCase()) && <VideoThumbnailIndicator />}
      {showName && <CatalogName name={item.name} isFile={!item.isDirectory} className="cap-catalog-thumbnail-name" />}</>}
  </span>;
};

export default ComputerSearchResultVisual;
