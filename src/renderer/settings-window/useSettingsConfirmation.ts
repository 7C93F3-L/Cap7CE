import { useCallback, useEffect, useState } from "react";

interface SettingsConfirmationState {
  message: string;
  confirmLabel?: string;
  action: () => Promise<unknown>;
}

export const useSettingsConfirmation = () => {
  const [dialog, setDialog] = useState<SettingsConfirmationState | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);

  useEffect(() => {
    const clearHiddenConfirmation = () => {
      if (document.visibilityState === "hidden") setDialog(null);
    };
    document.addEventListener("visibilitychange", clearHiddenConfirmation);
    return () => document.removeEventListener("visibilitychange", clearHiddenConfirmation);
  }, []);

  const openConfirmation = useCallback((message: string, action: () => Promise<unknown>, confirmLabel?: string) => {
    if (dialogBusy) return;
    setDialog({ message, action, confirmLabel });
  }, [dialogBusy]);

  const cancelDialog = useCallback(() => setDialog(null), []);
  const confirmDialog = useCallback(async () => {
    if (!dialog || dialogBusy) return;
    const pendingDialog = dialog;
    setDialogBusy(true);
    try { await pendingDialog.action(); } finally {
      setDialog((currentDialog) => currentDialog === pendingDialog ? null : currentDialog);
      setDialogBusy(false);
    }
  }, [dialog, dialogBusy]);

  return { dialog, dialogBusy, openConfirmation, cancelDialog, confirmDialog };
};
