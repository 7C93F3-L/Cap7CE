import warningGradientSvg from "../assets/icons/warning-gradient.svg?raw";
import { t } from "../../../electron/localization";
import SvgIcon from "../components/SvgIcon";
import DialogShell from "../dialogs/DialogShell";

interface SettingsConfirmationDialogProps {
  message: string;
  busy: boolean;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const SettingsConfirmationDialog = ({ message, busy, confirmLabel, onCancel, onConfirm }: SettingsConfirmationDialogProps) => (
  <DialogShell label={message} stable>
    <SvgIcon svg={warningGradientSvg} className="cap-svg-icon cap-dialog-warning-icon" />
    <div className="cap-dialog-message">{message}</div>
    <div className="cap-dialog-actions">
      <button type="button" autoFocus disabled={busy} onClick={onCancel}>{t("common.cancel")}</button>
      <button type="button" disabled={busy} onClick={onConfirm}>{busy ? t("common.loading") : confirmLabel ?? t("common.confirm")}</button>
    </div>
  </DialogShell>
);

export default SettingsConfirmationDialog;
