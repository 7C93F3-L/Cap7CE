import { useEffect, useRef, useState } from "react";
import { t } from "../../../electron/localization";
import type {
  ShortcutActionId,
  ShortcutActionPreferences,
  ShortcutActionsUpdateResult,
  ShortcutAvailabilityResult
} from "../../shared/types";
import {
  defaultShortcutActions,
  formatShortcutLabel,
  getShortcutFromKeyboardEvent,
  normalizeShortcutActions
} from "../shortcutActions";

const getShortcutActionItems = (): Array<{ id: ShortcutActionId; name: string }> => [
  { id: "activateCapsule", name: t("shortcut.activateCapsule") },
  { id: "activateMicro", name: t("shortcut.activateMicro") },
  { id: "activateMini", name: t("shortcut.activateMini") },
  { id: "activateNormal", name: t("shortcut.activateNormal") },
  { id: "activateStandby", name: t("shortcut.activateLine") },
  { id: "activateSkim", name: t("shortcut.activateSkim") },
  { id: "openSettings", name: t("shortcut.openSettings") },
  { id: "cycleDirectory", name: t("shortcut.cycleDirectory") }
];

export interface QuickActionSettingsRowsProps {
  quickActionGlobalEnabled: boolean;
  shortcutActions: ShortcutActionPreferences;
  unavailableShortcutActionIds: ShortcutActionId[];
  expanded: boolean;
  onGlobalEnabledChange: (enabled: boolean) => void;
  onShortcutActionsChange: (shortcutActions: ShortcutActionPreferences) => Promise<ShortcutActionsUpdateResult | null>;
  onShortcutCaptureStart: () => Promise<boolean>;
  onShortcutCaptureEnd: () => Promise<ShortcutAvailabilityResult>;
  onExpandedChange: (expanded: boolean) => void;
}

export const QuickActionSettingsRows = ({
  quickActionGlobalEnabled,
  shortcutActions,
  unavailableShortcutActionIds,
  expanded,
  onGlobalEnabledChange,
  onShortcutActionsChange,
  onShortcutCaptureStart,
  onShortcutCaptureEnd,
  onExpandedChange
}: QuickActionSettingsRowsProps) => {
  const collapseTimerRef = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);
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

  useEffect(() => () => {
    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
    }
  }, []);

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
      setShortcutActionDrafts(normalizeShortcutActions(result.preferences.shortcutActions));
      setDraftUnavailableActionIds([]);
      return;
    }
    setDraftUnavailableActionIds(result.unavailableActionIds);
  };

  const resetShortcutActions = async () => {
    if (capturingShortcutActionId) {
      await finishShortcutCapture();
    }
    setShortcutActionDrafts(defaultShortcutActions);
    const result = await onShortcutActionsChange(defaultShortcutActions);
    setDraftUnavailableActionIds(result?.applied ? [] : result?.unavailableActionIds ?? []);
  };

  const closeShortcutConfiguration = async () => {
    if (capturingShortcutActionId) {
      await finishShortcutCapture();
    }
    setShortcutActionDrafts(shortcutActions);
    setDraftUnavailableActionIds([]);
    if (closing) return;

    setClosing(true);
    const collapseDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    collapseTimerRef.current = window.setTimeout(() => {
      onExpandedChange(false);
      setClosing(false);
      collapseTimerRef.current = null;
    }, collapseDuration);
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

    window.addEventListener("keydown", handleShortcutCapture, true);
    return () => window.removeEventListener("keydown", handleShortcutCapture, true);
  }, [capturingShortcutActionId, shortcutActionDrafts]);

  if (!expanded) {
    return (
      <div className="cap-settings-row">
        <button className="cap-settings-pill" type="button" onClick={() => onGlobalEnabledChange(!quickActionGlobalEnabled)} title={quickActionGlobalEnabled ? t("settings.disableQuickActionsHint") : t("settings.enableQuickActionsHint")}>
          {quickActionGlobalEnabled ? t("settings.enabled") : t("settings.disabled")}
        </button>
        <span className="cap-settings-label">{t("settings.quickActions")}</span>
        <button className="cap-settings-pill" type="button" onClick={resetShortcutActions} title={t("settings.resetQuickActionsHint")}>{t("common.restoreDefault")}</button>
        <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={() => onExpandedChange(true)} title={t("settings.configureQuickActionsHint")} aria-expanded="false">{t("settings.configure")}</button>
      </div>
    );
  }

  return (
    <div className={`cap-settings-expandable-shell${closing ? " is-closing" : ""}`}>
      <div className="cap-settings-expandable-inner">
        <div className="cap-settings-quick-actions-panel">
          <div className="cap-settings-quick-actions-header">
            <span className="cap-settings-label">{t("settings.quickActions")}</span>
            <div className="cap-settings-quick-actions-controls">
              <button className="cap-settings-pill" type="button" disabled={capturingShortcutActionId !== null} onClick={() => onGlobalEnabledChange(!quickActionGlobalEnabled)} title={quickActionGlobalEnabled ? t("settings.disableQuickActionsHint") : t("settings.enableQuickActionsHint")}>
                {quickActionGlobalEnabled ? t("settings.enabled") : t("settings.disabled")}
              </button>
              <button className="cap-settings-pill" type="button" onClick={resetShortcutActions} title={t("settings.resetQuickActionsHint")}>{t("common.restoreDefault")}</button>
              <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={() => void closeShortcutConfiguration()} title={t("settings.finishQuickActionsHint")} aria-expanded="true">{t("settings.finishConfiguration")}</button>
            </div>
          </div>
          <div className="cap-settings-quick-actions-list">
            {getShortcutActionItems().map((item) => {
              const isCapturing = capturingShortcutActionId === item.id;
              const hasInternalConflict = getShortcutActionItems().some((otherItem) => (
                otherItem.id !== item.id && shortcutActionDrafts[otherItem.id] === shortcutActionDrafts[item.id]
              ));
              const isUnavailable = hasInternalConflict || unavailableShortcutActionIds.includes(item.id) || draftUnavailableActionIds.includes(item.id);
              return (
                <div className="cap-settings-quick-action-row" key={item.id}>
                  <span className="cap-settings-quick-action-name">{item.name}</span>
                  {!isCapturing && isUnavailable && (
                    <span className="cap-settings-quick-action-hint unavailable">{t("settings.shortcutUnavailable")}</span>
                  )}
                  <div className="cap-settings-quick-action-controls">
                    <button
                      className="cap-settings-pill cap-settings-shortcut-pill"
                      type="button"
                      title={t("settings.editShortcutActionHint")}
                      onClick={() => {
                        if (!isCapturing) void startShortcutCapture(item.id);
                      }}
                    >
                      {isCapturing ? t("settings.captureShortcut") : formatShortcutLabel(shortcutActionDrafts[item.id])}
                    </button>
                    {isCapturing && (
                      <button className="cap-settings-pill" type="button" onClick={() => void finishShortcutCapture()} title={t("settings.cancelShortcutCaptureHint")}>{t("common.cancel")}</button>
                    )}
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
