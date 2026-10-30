import { t } from "../localization/localization";

export const getQuickCommandGroups = (): Array<{
  title: string;
  items: Array<{ command: string; description: string }>;
}> => [
  {
    title: t("commands.group.settings"),
    items: [
      { command: "set:", description: t("commands.set.open") }
    ]
  },
  {
    title: t("commands.group.skim"),
    items: [
      { command: "skim:", description: t("commands.skim.open") },
      { command: "skim:root", description: t("commands.skim.root") },
      { command: "skim:scope default", description: t("commands.skim.scopeDefault") },
      { command: "skim:scope all", description: t("commands.skim.scopeAll") },
      { command: "skim:scope custom", description: t("commands.skim.scopeCustom") },
      { command: "skim:sort asc", description: t("commands.skim.sortAsc") },
      { command: "skim:sort desc", description: t("commands.skim.sortDesc") },
      { command: "skim:sort name", description: t("commands.skim.sortName") },
      { command: "skim:sort time", description: t("commands.skim.sortTime") },
      { command: "skim:hidden on", description: t("commands.skim.hiddenEnable") },
      { command: "skim:hidden off", description: t("commands.skim.hiddenDisable") }
    ]
  },
  {
    title: t("commands.group.view"),
    items: [
      { command: "see:dir all", description: t("commands.view.allDirectories") },
      { command: t("commands.example.viewDirectory"), description: t("commands.view.directory") },
      { command: "see:scope default", description: t("commands.view.scopeDefault") },
      { command: "see:scope all", description: t("commands.view.scopeAll") },
      { command: "see:scope custom", description: t("commands.view.scopeCustom") },
      { command: "see:sort asc", description: t("commands.view.sortAsc") },
      { command: "see:sort desc", description: t("commands.view.sortDesc") },
      { command: "see:sort name", description: t("commands.view.sortName") },
      { command: "see:sort time", description: t("commands.view.sortTime") }
    ]
  },
  {
    title: t("commands.group.window"),
    items: [
      { command: "win:line", description: t("commands.window.line") },
      { command: "win:max", description: t("commands.window.max") },
      { command: "win:reset", description: t("commands.window.reset") },
      { command: "win:top on", description: t("commands.window.pin") },
      { command: "win:top off", description: t("commands.window.unpin") }
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
      { command: "ui:acrylic", description: t("commands.appearance.acrylic") },
      { command: "ui:mica", description: t("commands.appearance.mica") },
      ...([12, 13, 14, 15, 16] as const).map((size) => ({ command: `ui:font ${size}`, description: t("commands.appearance.fontSize", { size }) })),
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
      { command: "app:notify on", description: t("commands.app.notificationsEnable") },
      { command: "app:notify off", description: t("commands.app.notificationsDisable") },
      { command: "edge:on", description: t("commands.edge.enable") },
      { command: "edge:off", description: t("commands.edge.disable") }
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
      { command: "cache:auto on", description: t("commands.cache.autoEnable") },
      { command: "cache:auto off", description: t("commands.cache.autoDisable") }
    ]
  }
];

export const getDangerousQuickCommandItems = () => [
  { command: t("commands.example.deleteDirectory"), description: t("commands.confirm.deleteDirectory") },
  { command: "app:quit", description: t("commands.confirm.quit") },
  { command: "llama:stop", description: t("commands.confirm.stopRuntime") },
  { command: "cache:clear", description: t("commands.confirm.clearCache") },
  { command: "cache:thumb", description: t("commands.confirm.clearThumbnailCache") },
  { command: "cache:skim", description: t("commands.confirm.clearSkimCache") }
];

