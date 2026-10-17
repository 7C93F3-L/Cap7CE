import type { CatalogRandomBrowseState } from "../../shared/catalogPresentationTypes";
import { t } from "../../../electron/localization";
import CatalogToolbarIcon from "./CatalogToolbarIcon";

export default function CatalogRandomControls({ random, disabled, busy }: {
  random: CatalogRandomBrowseState; disabled: boolean; busy: boolean;
}) {
  const title = `${t("explore.randomBrowse")} · ${t(random.enabled ? "common.enabled" : "common.disabled")}`;
  return <div className="cap-catalog-random-controls">
    <button type="button" className="cap-catalog-random-toggle" role="switch" aria-checked={random.enabled}
      disabled={disabled && !random.enabled} aria-label={t("explore.randomBrowse")} title={title} onClick={random.toggle}>
      <CatalogToolbarIcon name="shuffle" /></button>
    {random.enabled && <button type="button" className="cap-catalog-random-next" disabled={disabled || busy}
      aria-label={t("explore.nextBatch")} title={`${t("explore.nextBatch")} · ${random.batchNumber}`} onClick={random.next}>
      <CatalogToolbarIcon name="refresh" /></button>}
  </div>;
}
