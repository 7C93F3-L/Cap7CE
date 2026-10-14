import { useEffect, useRef, useState, type CSSProperties } from "react";
import { t } from "../../../electron/localization";
import { catalogGridSizeLimits } from "../../../electron/catalogGridSizeRules";
import StableSidebarFlyout from "../stable-ui/StableSidebarFlyout";
import CatalogToolbarIcon from "./CatalogToolbarIcon";
import "../settings-window/FontSizeSetting.css";
import "./CatalogGridSizeControl.css";

export default function CatalogGridSizeControl({ size, onPreview, onCommit }: {
  size: number; onPreview: (size: number) => void; onCommit: (size: number, force?: boolean) => void;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null), latest = useRef(size), buttonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { latest.current = size; }, [size]);
  const close = () => { onCommit(latest.current); setAnchor(null); };
  const progress = (size - catalogGridSizeLimits.minimum) / (catalogGridSizeLimits.maximum - catalogGridSizeLimits.minimum) * 100;
  return <>
    <button ref={buttonRef} type="button" className="cap-catalog-size-toggle" data-selection-preserve="true"
      aria-label={t("catalogWorkspace.viewSize")} title={`${t("catalogWorkspace.viewSize")} · ${size}%`} aria-expanded={anchor !== null}
      onClick={event => { if (anchor) close(); else { latest.current = size; setAnchor(event.currentTarget.getBoundingClientRect()); } }}><CatalogToolbarIcon name="size" /></button>
    {anchor && <StableSidebarFlyout anchor={anchor} label={t("catalogWorkspace.viewSize")} placement="below" width={240} maximumHeight={140}
      className="cap-catalog-size-flyout" closeOnScroll={false} returnFocus={buttonRef.current ?? undefined} onClose={close}>
      <div data-selection-preserve="true">
        <header><strong>{t("catalogWorkspace.viewSize")}</strong><output>{size}%</output></header>
        <div className="cap-font-size-setting" style={{ "--cap-font-size-progress": `${progress}%` } as CSSProperties}>
          <input autoFocus type="range" min={catalogGridSizeLimits.minimum} max={catalogGridSizeLimits.maximum} step={catalogGridSizeLimits.step}
            value={size} aria-label={t("catalogWorkspace.viewSize")} aria-valuetext={`${size}%`}
            onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
            onChange={event => { latest.current = Number(event.currentTarget.value); onPreview(latest.current); }}
            onPointerUp={event => onCommit(Number(event.currentTarget.value))} onPointerCancel={() => onCommit(latest.current)}
            onKeyUp={event => onCommit(Number(event.currentTarget.value))} onBlur={() => onCommit(latest.current)} />
          <div className="cap-font-size-scale" aria-hidden="true"><span>{t("catalogWorkspace.viewSmaller")}</span><span>{t("catalogWorkspace.viewDefault")}</span><span>{t("catalogWorkspace.viewLarger")}</span></div>
        </div>
      </div>
    </StableSidebarFlyout>}
  </>;
}
