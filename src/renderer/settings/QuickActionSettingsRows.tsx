import { useEffect, useState } from "react";
import { t } from "../../../electron/localization";
import type {
  ShortcutActionId,
  ShortcutActionPreferences,
  ShortcutActionsUpdateResult,
  ShortcutAvailabilityResult
} from "../../shared/types";
import {
  defaultStableShortcutActions,
  formatShortcutLabel,
  getShortcutFromKeyboardEvent,
  normalizeStableShortcutActions
} from "../shortcutActions";
import clearIcon from "../assets/icons/icon-stable-clear-search.svg?raw";
import SvgIcon from "../components/SvgIcon";

const getShortcutActionItems = (): Array<{ id: ShortcutActionId; name: string }> => ([
  { id: "focusMainSearch", name: t("shortcut.focusMainSearch") },
  { id: "hideToLine", name: t("shortcut.hideToLine") },
  { id: "restoreDefaultWindow", name: t("shortcut.restoreDefaultWindow") },
  { id: "toggleWindowMode", name: t("shortcut.toggleWindowMode") },
  { id: "toggleSkim", name: t("shortcut.toggleSkim") },
  { id: "openSettings", name: t("shortcut.openSettings") },
  { id: "cycleDirectory", name: t("shortcut.cycleDirectory") }
] as Array<{ id: ShortcutActionId; name: string }>);

export interface QuickActionSettingsRowsProps {
  quickActionGlobalEnabled: boolean;
  shortcutActions: ShortcutActionPreferences;
  unavailableShortcutActionIds: ShortcutActionId[];
  onGlobalEnabledChange: (enabled: boolean) => void;
  onShortcutActionsChange: (shortcutActions: ShortcutActionPreferences) => Promise<ShortcutActionsUpdateResult | null>;
  onShortcutCaptureStart: () => Promise<boolean>;
  onShortcutCaptureEnd: () => Promise<ShortcutAvailabilityResult>;
}

export const QuickActionSettingsRows = ({
  quickActionGlobalEnabled,
  shortcutActions,
  unavailableShortcutActionIds,
  onGlobalEnabledChange,
  onShortcutActionsChange,
  onShortcutCaptureStart,
  onShortcutCaptureEnd
}: QuickActionSettingsRowsProps) => {
  const [capturingShortcutActionId, setCapturingShortcutActionId] = useState<ShortcutActionId | null>(null);
  const [shortcutActionDrafts, setShortcutActionDrafts] = useState<ShortcutActionPreferences>(shortcutActions);
  const [draftUnavailableActionIds, setDraftUnavailableActionIds] = useState<ShortcutActionId[]>([]);

  useEffect(() => {
    setShortcutActionDrafts(shortcutActions);
    setDraftUnavailableActionIds([]);
  }, [shortcutActions]);

  useEffect(() => () => {
    void onShortcutCaptureEnd();
  }, [onShortcutCaptureEnd]);

  const startShortcutCapture = async (shortcutActionId: ShortcutActionId) => {
    if (await onShortcutCaptureStart()) {
      setCapturingShortcutActionId(shortcutActionId);
    }
  };

  const finishShortcutCapture = async (syncDraftAvailability = true) => {
    setCapturingShortcutActionId(null);
    const availability = await onShortcutCaptureEnd();
    if (syncDraftAvailability) {
      setDraftUnavailableActionIds(availability.unavailableActionIds);
    }
  };

  const updateShortcutAction = async (shortcutActionId: ShortcutActionId, shortcut: string) => {
    const nextShortcutActions = {
      ...shortcutActionDrafts,
      [shortcutActionId]: shortcut
    };
    setShortcutActionDrafts(nextShortcutActions);

    const hasInternalConflict = getShortcutActionItems().some((item) => (
      item.id !== shortcutActionId && nextShortcutActions[item.id] === shortcut
    ));
    if (hasInternalConflict) {
      setDraftUnavailableActionIds([shortcutActionId]);
      return;
    }

    const result = await onShortcutActionsChange(nextShortcutActions);
    if (!result) {
      setDraftUnavailableActionIds([shortcutActionId]);
      return;
    }
    if (result.applied) {
      setShortcutActionDrafts(normalizeStableShortcutActions(result.preferences.stableShortcutActions));
      setDraftUnavailableActionIds([]);
      return;
    }
    setDraftUnavailableActionIds(result.unavailableActionIds);
  };

  const clearShortcutAction = (shortcutActionId: ShortcutActionId) => {
    if (!shortcutActionDrafts[shortcutActionId]) return;
    void updateShortcutAction(shortcutActionId, "");
  };

  const resetShortcutActions = async () => {
    if (capturingShortcutActionId) {
      await finishShortcutCapture();
    }
    const defaultActions = defaultStableShortcutActions;
    setShortcutActionDrafts(defaultActions);
    const result = await onShortcutActionsChange(defaultActions);
    setDraftUnavailableActionIds(result?.applied ? [] : result?.unavailableActionIds ?? []);
  };

  useEffect(() => {
    if (!capturingShortcutActionId) return undefined;

    const handleShortcutCapture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        void finishShortcutCapture();
        return;
      }

      const nextShortcut = getShortcutFromKeyboardEvent(event);
      if (!nextShortcut) return;

      const shortcutActionId = capturingShortcutActionId;
      setCapturingShortcutActionId(null);
      void updateShortcutAction(shortcutActionId, nextShortcut).finally(() => {
        void finishShortcutCapture(false);
      });
    };

    const handleShortcutCaptureOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-shortcut-capturing="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      void finishShortcutCapture();
    };

    window.addEventListener("keydown", handleShortcutCapture, true);
    window.addEventListener("click", handleShortcutCaptureOutsideClick, true);
    return () => {
      window.removeEventListener("keydown", handleShortcutCapture, true);
      window.removeEventListener("click", handleShortcutCaptureOutsideClick, true);
    };
  }, [capturingShortcutActionId, shortcutActionDrafts]);

  return (
    <div className="cap-settings-expandable-shell">
      <div className="cap-settings-expandable-inner">
        <div className="cap-settings-quick-actions-panel">
          <div className="cap-settings-quick-actions-header">
            <div className="cap-settings-quick-actions-controls">
              <button className="cap-stable-settings-toggle" type="button" role="switch" aria-checked={quickActionGlobalEnabled} data-checked={quickActionGlobalEnabled} disabled={capturingShortcutActionId !== null} onClick={() => onGlobalEnabledChange(!quickActionGlobalEnabled)} title={quickActionGlobalEnabled ? t("settings.disableQuickActionsHint") : t("settings.enableQuickActionsHint")}>
                <span>{quickActionGlobalEnabled ? t("settings.enabled") : t("settings.disabled")}</span><i aria-hidden="true" />
              </button>
              <button className="cap-settings-pill" type="button" onClick={resetShortcutActions} title={t("settings.resetQuickActionsHint")}>{t("common.restoreDefault")}</button>
            </div>
          </div>
          <div className="cap-settings-quick-actions-list">
            {getShortcutActionItems().map((item) => {
              const isCapturing = capturingShortcutActionId === item.id;
              const shortcut = shortcutActionDrafts[item.id];
              const hasInternalConflict = Boolean(shortcut) && getShortcutActionItems().some((otherItem) => (
                otherItem.id !== item.id && shortcutActionDrafts[otherItem.id] === shortcutActionDrafts[item.id]
              ));
              const isUnavailable = hasInternalConflict || unavailableShortcutActionIds.includes(item.id) || draftUnavailableActionIds.includes(item.id);
              return (
                <div className="cap-settings-quick-action-row" key={item.id}>
                  <span className="cap-settings-quick-action-name">{item.name}</span>
                  {!isCapturing && isUnavailable && (
                    <span className="cap-settings-quick-action-hint unavailable">{t("settings.shortcutUnavailable")}</span>
                  )}
                  {isCapturing && (
                    <span className="cap-settings-quick-action-hint capture" aria-live="polite">{t("settings.shortcutCaptureCancelHint")}</span>
                  )}
                  <div className="cap-settings-quick-action-controls">
                    <button
                      className="cap-settings-pill cap-settings-shortcut-pill"
                      type="button"
                      data-shortcut-capturing={isCapturing}
                      data-shortcut-unassigned={!shortcut}
                      title={isCapturing ? t("settings.cancelShortcutCaptureHint") : t("settings.editShortcutActionHint")}
                      onClick={() => {
                        if (!isCapturing) void startShortcutCapture(item.id);
                      }}
                    >
                      {isCapturing ? t("settings.captureShortcut") : shortcut ? formatShortcutLabel(shortcut) : t("settings.shortcutUnassigned")}
                    </button>
                    {shortcut && <button
                      className="cap-settings-pill cap-settings-shortcut-clear-button"
                      type="button"
                      disabled={capturingShortcutActionId !== null}
                      aria-label={`${t("settings.clearShortcutAction")}: ${item.name}`}
                      onClick={() => clearShortcutAction(item.id)}
                    ><SvgIcon svg={clearIcon} className="cap-svg-icon cap-settings-shortcut-clear-icon" /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
