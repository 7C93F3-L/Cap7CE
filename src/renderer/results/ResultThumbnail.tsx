import { useEffect, useState, type ReactNode } from "react";
import type { ImageIndexItem } from "../../shared/types";
import SvgIcon from "../components/SvgIcon";
import { TwoLineMiddleEllipsisFileName } from "../components/MiddleEllipsisFileName";
import { getFormatIconSvg } from "../formatIcons";

const videoThumbnailExtensions = new Set([
  ".avi", ".m4v", ".mkv", ".mov", ".mp4", ".webm", ".wmv", ".mpg", ".mpeg",
  ".mts", ".m2ts", ".mxf", ".flv", ".rmvb", ".3gp"
]);

const VideoThumbnailIndicator = () => (
  <span className="video-thumbnail-indicator" aria-hidden="true">
    <svg viewBox="0 0 28 28" focusable="false">
      <path d="M9.8 4.65C8.3 3.7 6.35 4.78 6.35 6.55v14.9c0 1.77 1.95 2.85 3.45 1.9l11.63-7.45c1.37-.88 1.37-2.92 0-3.8L9.8 4.65Z" />
    </svg>
  </span>
);

const ThumbnailContent = ({ thumbnailUrl, fallback, overlay }: { thumbnailUrl: string; fallback: ReactNode; overlay?: ReactNode }) => {
  const [showPlaceholder, setShowPlaceholder] = useState(!thumbnailUrl);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setShowPlaceholder(!thumbnailUrl);
    setImageLoaded(false);
  }, [thumbnailUrl]);

  return showPlaceholder ? fallback : (
    <>
      <span className="thumbnail-image-frame">
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setImageLoaded(true)}
          onError={(event) => {
            event.currentTarget.style.display = "none";
            setImageLoaded(false);
            setShowPlaceholder(true);
          }}
        />
      </span>
      {imageLoaded && overlay}
    </>
  );
};

export const UnrecognizedThumbnail = ({ item }: { item: ImageIndexItem }) => (
  <span className="unrecognized-thumbnail">
    <ThumbnailContent
      thumbnailUrl={item.thumbnailUrl}
      fallback={<SvgIcon svg={getFormatIconSvg(item.extension, item.iconName)} className="cap-svg-icon unrecognized-format-icon" />}
      overlay={videoThumbnailExtensions.has(item.extension.toLowerCase()) ? <VideoThumbnailIndicator /> : undefined}
    />
  </span>
);

const ResultFormatCard = ({ item }: { item: ImageIndexItem }) => (
  <span className="result-file-card">
    <SvgIcon
      svg={getFormatIconSvg(item.extension, item.iconName)}
      className="cap-svg-icon result-file-card-icon"
    />
    <TwoLineMiddleEllipsisFileName fileName={item.fileName} className="result-file-card-name" />
  </span>
);

export const ResultThumbnailContent = ({ item }: { item: ImageIndexItem }) => {
  const fallback = <ResultFormatCard item={item} />;
  return item.resultKind === "file" && !item.canShellPreview
    ? fallback
    : <ThumbnailContent
      thumbnailUrl={item.thumbnailUrl}
      fallback={fallback}
      overlay={videoThumbnailExtensions.has(item.extension.toLowerCase()) ? <VideoThumbnailIndicator /> : undefined}
    />;
};
