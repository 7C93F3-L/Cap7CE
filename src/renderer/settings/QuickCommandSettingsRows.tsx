import { useEffect, useRef, useState } from "react";
import { t } from "../../../electron/localization";

import { getQuickCommandGroups, getDangerousQuickCommandItems } from "../../../core/node/resourceCatalog/domain/commands/quickCommandReference";
export { getQuickCommandGroups, getDangerousQuickCommandItems } from "../../../core/node/resourceCatalog/domain/commands/quickCommandReference";

export interface QuickCommandSettingsRowsProps {
  groups?: ReturnType<typeof getQuickCommandGroups>;
  dangerousItems?: ReturnType<typeof getDangerousQuickCommandItems>;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  stableUi?: boolean;
}

export const QuickCommandSettingsRows = ({ expanded = false, onExpandedChange = () => undefined, stableUi = false, groups, dangerousItems }: QuickCommandSettingsRowsProps) => {
  const collapseTimerRef = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);

  const closeQuickCommands = () => {
    if (closing) return;

    setClosing(true);
    const collapseDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    collapseTimerRef.current = window.setTimeout(() => {
      onExpandedChange(false);
      setClosing(false);
      collapseTimerRef.current = null;
    }, collapseDuration);
  };

  useEffect(() => () => {
    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
    }
  }, []);

  if (!stableUi && !expanded) {
    return (
      <div className="cap-settings-row">
        <span className="cap-settings-label">{t("settings.quickCommands")}</span>
        <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={() => onExpandedChange(true)} title={t("settings.openQuickCommandsHint")} aria-expanded="false">{t("common.view")}</button>
      </div>
    );
  }

  const commandGroups = (
    <div className="cap-settings-quick-command-groups">
      {(groups ?? getQuickCommandGroups()).map((group) => (
        <section className="cap-settings-quick-command-group" key={group.title}>
          <h3>{group.title}</h3>
          <div className="cap-settings-quick-command-list">
            {group.items.map((item) => (
              <div className="cap-settings-quick-command-item" key={item.command}>
                <span className="cap-settings-command-pill">{item.command}</span>
                <span className="cap-settings-command-description">{item.description}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
      <section className="cap-settings-quick-command-group cap-settings-quick-command-danger" key="danger">
        <h3>{t("settings.confirmationCommands")}</h3>
        <p>{t("settings.confirmationCommandHint")}</p>
        <div className="cap-settings-quick-command-list">
          {(dangerousItems ?? getDangerousQuickCommandItems()).map((item) => (
            <div className="cap-settings-quick-command-item" key={item.command}>
              <span className="cap-settings-command-pill">{item.command}</span>
              <span className="cap-settings-command-description">{item.description}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  if (stableUi) {
    return <div className="cap-settings-quick-commands-panel cap-settings-quick-commands-panel-stable">{commandGroups}</div>;
  }

  return (
    <div className={`cap-settings-expandable-shell${closing ? " is-closing" : ""}`}>
      <div className="cap-settings-expandable-inner">
        <div className="cap-settings-quick-commands-panel">
          <div className="cap-settings-quick-commands-header">
            <span className="cap-settings-label">{t("settings.quickCommands")}</span>
            <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={closeQuickCommands} title={t("settings.closeQuickCommandsHint")} aria-expanded="true">{t("settings.closeQuickCommands")}</button>
          </div>
          {commandGroups}
        </div>
      </div>
    </div>
  );
};
