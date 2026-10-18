import { t } from "../../../electron/localization";
import { QuickCommandSettingsRows, getQuickCommandGroups, getDangerousQuickCommandItems } from "../settings/QuickCommandSettingsRows";
import { parseCatalogCommand } from "./catalogCommandRegistry";

export function CatalogQuickCommandSettingsRows(_props: { stableUi?: boolean }) {
  const groups = getQuickCommandGroups().map(group => ({ ...group, items: group.items.filter(item => parseCatalogCommand(item.command).type === "valid").map(item => ({ ...item,
    description: item.command.startsWith("dir:add") ? t("catalogCommand.addFavorite") : item.command.startsWith("dir:rename") ? t("catalogCommand.renameFavorite")
      : item.command.startsWith("see:dir") ? t("catalogCommand.selectFavorite") : item.description })) })).filter(group => group.items.length);
  groups.find(group => group.title === t("commands.group.view"))?.items.push(
    { command: "see:root", description: t("catalogCommand.root") },
    ...["on", "off"].flatMap(value => [
      { command: `see:hidden ${value}`, description: t(value === "on" ? "commands.skim.hiddenEnable" : "commands.skim.hiddenDisable") },
      { command: `see:subfolders ${value}`, description: t(value === "on" ? "catalogCommand.includeSubfolders" : "catalogCommand.excludeSubfolders") }
    ]));
  const dangerousItems = getDangerousQuickCommandItems().filter(item => parseCatalogCommand(item.command).type === "valid")
    .map(item => item.command === "cache:clear" ? { ...item, description: t("catalogCommand.clearCache") } : item);
  dangerousItems.unshift({ command: t("catalogCommand.removeExample"), description: t("catalogCommand.removeFavorite") });
  return <QuickCommandSettingsRows stableUi groups={groups} dangerousItems={dangerousItems} />;
}
