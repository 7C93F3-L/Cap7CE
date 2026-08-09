import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";

const viewportGap = 5;
const pointerOffset = 12;
const movementDismissThreshold = 14;
const openDelayMs = 250;

export interface TransientFileInfoCard<T> {
  item: T;
  x: number;
  y: number;
}

export const useTransientFileInfoCard = <T,>() => {
  const [card, setCard] = useState<TransientFileInfoCard<T> | null>(null);
  const timerRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
    setCard(null);
  }, []);

  const schedule = useCallback((event: ReactMouseEvent, item: T) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const anchor = { x: event.clientX, y: event.clientY };
    originRef.current = anchor;
    setCard(null);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (originRef.current === anchor) {
        setCard({ item, x: anchor.x, y: anchor.y });
      }
    }, openDelayMs);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const origin = originRef.current;
      if (!origin || Math.hypot(event.clientX - origin.x, event.clientY - origin.y) <= movementDismissThreshold) return;
      dismiss();
    };
    const handleScroll = () => dismiss();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [dismiss]);

  return useMemo(() => ({ card, schedule, dismiss }), [card, dismiss, schedule]);
};

export const truncateFileInfoName = (fileName: string, maximumLength: number) => {
  if (fileName.length <= maximumLength) return fileName;
  const extensionIndex = fileName.lastIndexOf(".");
  const suffix = extensionIndex > 0 && fileName.length - extensionIndex <= 10
    ? fileName.slice(extensionIndex)
    : "";
  const stem = suffix ? fileName.slice(0, extensionIndex) : fileName;
  const remaining = Math.max(8, maximumLength - suffix.length - 1);
  const leadingLength = Math.ceil(remaining * 0.55);
  const trailingLength = Math.max(3, remaining - leadingLength);
  return `${stem.slice(0, leadingLength)}…${stem.slice(-trailingLength)}${suffix}`;
};

interface FileInfoCardProps {
  x: number;
  y: number;
  theme: "light" | "dark";
  menuStyle?: CSSProperties;
  compact?: boolean;
  heading: string;
  fileName: string;
  details: string[];
}

const FileInfoCard = ({ x, y, theme, menuStyle, compact = false, heading, fileName, details }: FileInfoCardProps) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; key: string } | null>(null);
  const measurementKey = `${x}:${y}:${compact}:${heading}:${fileName}:${details.join("|")}`;

  useLayoutEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const rightPosition = x + pointerOffset;
    const leftPosition = x - bounds.width - pointerOffset;
    const bottomPosition = y + pointerOffset;
    const topPosition = y - bounds.height - pointerOffset;
    const left = rightPosition + bounds.width <= window.innerWidth - viewportGap
      ? rightPosition
      : leftPosition >= viewportGap
        ? leftPosition
        : Math.min(Math.max(rightPosition, viewportGap), Math.max(viewportGap, window.innerWidth - bounds.width - viewportGap));
    const top = bottomPosition + bounds.height <= window.innerHeight - viewportGap
      ? bottomPosition
      : topPosition >= viewportGap
        ? topPosition
        : Math.min(Math.max(bottomPosition, viewportGap), Math.max(viewportGap, window.innerHeight - bounds.height - viewportGap));
    setPosition({
      left,
      top,
      key: measurementKey
    });
  }, [measurementKey, x, y]);

  const measuredPosition = position?.key === measurementKey ? position : null;
  return createPortal(
    <div
      ref={cardRef}
      className={`context-menu context-menu-${theme} file-info-card${compact ? " file-info-card-compact" : ""}`}
      style={{
        ...menuStyle,
        left: measuredPosition?.left ?? x,
        top: measuredPosition?.top ?? y,
        visibility: measuredPosition ? "visible" : "hidden"
      }}
      role="status"
      aria-label={`${heading} ${fileName}`}
    >
      <div className="cap7ce-menu-motion-surface">
        <strong className="file-info-card-heading">{heading}</strong>
        <span className="file-info-card-name" title={fileName}>{fileName}</span>
        <div className="file-info-card-details">
          {details.map((detail) => <span key={detail}>{detail}</span>)}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FileInfoCard;
