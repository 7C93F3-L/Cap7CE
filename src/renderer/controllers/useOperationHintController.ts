import { useCallback, useEffect, useRef, useState } from "react";
import { t, type TranslationKey } from "../../../electron/localization";
import type { ShortcutActionId, ShortcutActionPreferences } from "../../shared/types";

interface OperationHintDefinition {
  key: TranslationKey;
  shortcutActionId?: ShortcutActionId;
  requiresCommands?: boolean;
}

const initialOperationHintKey: TranslationKey = "search.guide.search";
const operationHintDefinitions: OperationHintDefinition[] = [
  { key: initialOperationHintKey },
  { key: "search.guide.showCurrent" },
  { key: "search.guide.activateCapsule", shortcutActionId: "activateCapsule" },
  { key: "search.guide.activateMicro", shortcutActionId: "activateMicro" },
  { key: "search.guide.activateMini", shortcutActionId: "activateMini" },
  { key: "search.guide.activateNormal", shortcutActionId: "activateNormal" },
  { key: "search.guide.activateLine", shortcutActionId: "activateStandby" },
  { key: "search.guide.activateSkim", shortcutActionId: "activateSkim" },
  { key: "search.guide.openSettings", shortcutActionId: "openSettings" },
  { key: "search.guide.preview" },
  { key: "search.guide.previewNavigate" },
  { key: "search.guide.previewContextMenu" },
  { key: "search.guide.multiSelect" },
  { key: "search.guide.batchActions" },
  { key: "search.guide.dragResult" },
  { key: "search.guide.labels" },
  { key: "search.guide.hideLabel" },
  { key: "search.guide.labelMenu" },
  { key: "search.guide.commandDark", requiresCommands: true },
  { key: "search.guide.viewCommands" },
  { key: "search.guide.editShortcuts" },
  { key: "search.guide.trayNormal" },
  { key: "search.guide.focusSearch" },
  { key: "search.guide.resultContextMenu" }
];

interface OperationHintControllerOptions {
  shellState: string;
  query: string;
  enabled: boolean;
  commandEnabled: boolean;
  quickActionGlobalEnabled: boolean;
  unavailableShortcutActionIds: ShortcutActionId[];
  shortcutActions: ShortcutActionPreferences;
}

export const useOperationHintController = ({
  shellState,
  query,
  enabled,
  commandEnabled,
  quickActionGlobalEnabled,
  unavailableShortcutActionIds,
  shortcutActions
}: OperationHintControllerOptions) => {
  const [operationHintKey, setOperationHintKey] = useState<TranslationKey>(initialOperationHintKey);
  const previousQueryRef = useRef("");
  const initialHintShownRef = useRef(false);

  const selectRandomOperationHint = useCallback(() => {
    setOperationHintKey((currentKey) => {
      const availableHints = operationHintDefinitions.filter((hint) => {
        if (hint.requiresCommands && !commandEnabled) {
          return false;
        }
        if (!hint.shortcutActionId) {
          return true;
        }
        return quickActionGlobalEnabled && !unavailableShortcutActionIds.includes(hint.shortcutActionId);
      });
      const candidates = availableHints.filter((hint) => hint.key !== currentKey);
      const nextHints = candidates.length > 0 ? candidates : availableHints;
      return nextHints[Math.floor(Math.random() * nextHints.length)]?.key ?? initialOperationHintKey;
    });
  }, [commandEnabled, quickActionGlobalEnabled, unavailableShortcutActionIds]);

  useEffect(() => {
    if (shellState === "standby") {
      return;
    }
    if (!initialHintShownRef.current) {
      initialHintShownRef.current = true;
      return;
    }
    selectRandomOperationHint();
  }, [shellState]);

  useEffect(() => {
    const previousQuery = previousQueryRef.current;
    previousQueryRef.current = query;
    if (previousQuery.length > 0 && query.length === 0) {
      selectRandomOperationHint();
    }
  }, [query]);

  const operationHintDefinition = operationHintDefinitions.find((hint) => hint.key === operationHintKey);
  return enabled && query.length === 0
    ? t(operationHintKey, operationHintDefinition?.shortcutActionId
      ? { shortcut: shortcutActions[operationHintDefinition.shortcutActionId] }
      : {})
    : "";
};
