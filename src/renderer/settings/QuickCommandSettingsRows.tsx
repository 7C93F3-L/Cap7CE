import { useEffect, useRef, useState } from "react";
import { t } from "../../../electron/localization";

const getQuickCommandGroups = (): Array<{
  title: string;
  items: Array<{ command: string; description: string }>;
}> => [
  {
    title: t("commands.group.skim"),
    items: [
      { command: "skim:", description: t("commands.skim.open") },
      { command: "skim:root", description: t("commands.skim.root") }
    ]
  },
  {
    title: t("commands.group.settings"),
    items: [
      { command: "set:", description: t("commands.set.open") },
      { command: "set:quick", description: t("commands.set.quick") },
      { command: "set:cmd", description: t("commands.set.commands") }
    ]
  },
  {
    title: t("commands.group.view"),
    items: [
      { command: "see:all", description: t("commands.view.all") },
      { command: t("commands.example.viewDirectory"), description: t("commands.view.directory") }
    ]
  },
  {
    title: t("commands.group.window"),
    items: [
      { command: "win:line", description: t("commands.window.line") },
      { command: "win:cap", description: t("commands.window.capsule") },
      { command: "win:micro", description: t("commands.window.micro") },
      { command: "win:mini", description: t("commands.window.mini") },
      { command: "win:normal", description: t("commands.window.normal") },
      { command: "win:max", description: t("commands.window.max") },
      { command: "win:top on", description: t("commands.window.pin") },
      { command: "win:top off", description: t("commands.window.unpin") }
    ]
  },
  {
    title: t("commands.group.tags"),
    items: [
      { command: "tag:dir", description: t("commands.tags.showDirectory") },
      { command: t("commands.example.selectDirectory"), description: t("commands.tags.selectDirectory") },
      { command: "tag:sort", description: t("commands.tags.showSort") },
      { command: "tag:sort asc", description: t("commands.tags.sortAsc") },
      { command: "tag:sort desc", description: t("commands.tags.sortDesc") },
      { command: "tag:show all", description: t("commands.tags.showAll") },
      { command: "tag:hide all", description: t("commands.tags.hideAll") },
      { command: "tag:hide dir", description: t("commands.tags.hideDirectory") },
      { command: "tag:hide sort", description: t("commands.tags.hideSort") }
    ]
  },
  {
    title: t("commands.group.directory"),
    items: [
      { command: t("commands.example.addDirectory"), description: t("commands.directory.add") },
      { command: t("commands.example.renameDirectory"), description: t("commands.directory.rename") },
      { command: "dir:refresh", description: t("commands.directory.refresh") }
    ]
  },
  {
    title: t("commands.group.appearance"),
    items: [
      { command: "ui:light", description: t("commands.appearance.light") },
      { command: "ui:dark", description: t("commands.appearance.dark") },
      { command: "ui:auto", description: t("commands.appearance.system") },
      { command: "ui:main #RRGGBB", description: t("commands.appearance.themeColor") },
      { command: "ui:accent #RRGGBB", description: t("commands.appearance.accentColor") },
      { command: "ui:reset", description: t("commands.appearance.reset") }
    ]
  },
  {
    title: t("commands.group.appBehavior"),
    items: [
      { command: "app:startup on", description: t("commands.app.startupEnable") },
      { command: "app:startup off", description: t("commands.app.startupDisable") },
      { command: "app:hints on", description: t("commands.app.hintsEnable") },
      { command: "app:hints off", description: t("commands.app.hintsDisable") }
    ]
  },
  {
    title: t("commands.group.line"),
    items: [
      { command: "line:on", description: t("commands.line.show") },
      { command: "line:off", description: t("commands.line.hide") }
    ]
  },
  {
    title: t("commands.group.shortcuts"),
    items: [
      { command: "key:global on", description: t("commands.shortcuts.enable") },
      { command: "key:global off", description: t("commands.shortcuts.disable") },
      { command: "key:reset", description: t("commands.shortcuts.reset") }
    ]
  },
  {
    title: t("commands.group.commands"),
    items: [
      { command: "cmd:on", description: t("commands.parser.enable") },
      { command: "cmd:off", description: t("commands.parser.disable") }
    ]
  },
  {
    title: t("commands.group.language"),
    items: [
      { command: "lang:auto", description: t("commands.language.system") },
      { command: "lang:cn", description: t("commands.language.chinese") },
      { command: "lang:en", description: t("commands.language.english") }
    ]
  },
  {
    title: t("commands.group.runtime"),
    items: [
      { command: "llama:start", description: t("commands.runtime.start") },
      { command: t("commands.example.selectRuntime"), description: t("commands.runtime.select") },
      { command: "llama:refresh", description: t("commands.runtime.refresh") }
    ]
  },
  {
    title: t("commands.group.model"),
    items: [
      { command: "model:refresh", description: t("commands.model.refresh") },
      { command: t("commands.example.selectModel"), description: t("commands.model.select") }
    ]
  },
  {
    title: t("commands.group.cache"),
    items: [
      { command: "cache:thumb", description: t("commands.cache.thumbnail") },
      { command: "cache:preview", description: t("commands.cache.preview") },
      { command: "cache:model", description: t("commands.cache.model") },
      { command: "cache:skim", description: t("commands.cache.skim") }
    ]
  }
];

const getDangerousQuickCommandItems = () => [
  { command: t("commands.example.deleteDirectory"), description: t("commands.confirm.deleteDirectory") },
  { command: "idx:clear all", description: t("commands.confirm.clearIndex") },
  { command: "app:quit", description: t("commands.confirm.quit") },
  { command: "llama:stop", description: t("commands.confirm.stopRuntime") },
  { command: "cache:clear", description: t("commands.confirm.clearCache") },
  { command: "cache:skim", description: t("commands.confirm.clearSkimCache") }
];

export interface QuickCommandSettingsRowsProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export const QuickCommandSettingsRows = ({ expanded, onExpandedChange }: QuickCommandSettingsRowsProps) => {
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

  if (!expanded) {
    return (
      <div className="cap-settings-row">
        <span className="cap-settings-label">{t("settings.quickCommands")}</span>
        <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={() => onExpandedChange(true)} title={t("settings.openQuickCommandsHint")} aria-expanded="false">{t("common.view")}</button>
      </div>
    );
  }

  return (
    <div className={`cap-settings-expandable-shell${closing ? " is-closing" : ""}`}>
      <div className="cap-settings-expandable-inner">
        <div className="cap-settings-quick-commands-panel">
          <div className="cap-settings-quick-commands-header">
            <span className="cap-settings-label">{t("settings.quickCommands")}</span>
            <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={closeQuickCommands} title={t("settings.closeQuickCommandsHint")} aria-expanded="true">{t("settings.closeQuickCommands")}</button>
          </div>
          <div className="cap-settings-quick-command-groups">
            {getQuickCommandGroups().map((group) => (
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
                {getDangerousQuickCommandItems().map((item) => (
                  <div className="cap-settings-quick-command-item" key={item.command}>
                    <span className="cap-settings-command-pill">{item.command}</span>
                    <span className="cap-settings-command-description">{item.description}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
