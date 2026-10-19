import type { ReactNode } from "react";
import "./BottomNoticeBar.css";
import GradientProgress from "./GradientProgress";

interface BottomNoticeBarProps {
  message: string;
  title?: string;
  className?: string;
  progress?: { label: string; value?: number };
  detail?: string;
  actions?: ReactNode;
}

export default function BottomNoticeBar({ message, title, className = "", progress, detail, actions }: BottomNoticeBarProps) {
  return <div className={`cap-bottom-notice-bar${className ? ` ${className}` : ""}`} role="status" aria-live="polite" data-selection-preserve="true">
    <span className="cap-bottom-notice-message" title={title ?? message}>{message}</span>
    {progress && <GradientProgress label={progress.label} value={progress.value} />}
    {detail && <span className="cap-bottom-notice-detail" title={detail}>{detail}</span>}
    {actions && <div className="cap-bottom-notice-actions">{actions}</div>}
  </div>;
}
