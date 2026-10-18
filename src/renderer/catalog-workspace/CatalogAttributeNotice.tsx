import { t } from "../../../electron/localization";
import BottomNoticeBar from "../feedback/BottomNoticeBar";
import "./CatalogAttributeNotice.css";

export default function CatalogAttributeNotice({ message, path, busy, task, checking, onCurrent, onAll, onCustom, onDismiss, onHold }: {
  message: string; path: string | null; busy: boolean; task: boolean; checking: boolean;
  onCurrent: () => void; onAll: () => void; onCustom: () => void; onDismiss: () => void; onHold: (value: boolean) => void;
}) {
  return <div className="cap-catalog-attribute-prompt" onPointerEnter={() => onHold(true)} onPointerLeave={() => onHold(false)}
    onFocusCapture={() => onHold(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onHold(false); }}>
    <BottomNoticeBar message={message} actions={<>
      {task ? <button type="button" onClick={onCustom}>{t("metadataQuick.viewTask")}</button> : !checking && <>
        {path && <button type="button" disabled={busy} title={t("metadataQuick.currentHint")} onClick={onCurrent}>{t("metadataQuick.current")}</button>}
        <button type="button" disabled={busy} title={t("metadataQuick.allHint")} onClick={onAll}>{t("metadataQuick.all")}</button>
        <button type="button" disabled={busy} onClick={onCustom}>{t("metadataQuick.custom")}</button>
      </>}
      <button type="button" disabled={busy} aria-label={t("common.close")} onClick={onDismiss}>×</button>
    </>} />
  </div>;
}
