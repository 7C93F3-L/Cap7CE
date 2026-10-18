import { t } from "../../../electron/localization";
import type { CatalogCommandOperation } from "../../shared/catalogCommandTypes";
import type { ParsedQuickCommand } from "../commandParser";
import type { UserPreferences, UiFontSize } from "../../shared/types";
import { defaultAppearanceColors } from "../appearance";
import { defaultStableShortcutActions } from "../shortcutActions";
import { CatalogCommandError, requireCommandSuccess } from "./catalogCommandErrors";

export function catalogPreferenceCommand(command: ParsedQuickCommand): CatalogCommandOperation | null {
  const { domain, action, args } = command, enabled = args[0] === "on";
  const run = async () => {
    const api = window.cap7ce!.preferences;
    if (domain === "ui") {
      if (["light", "dark", "auto"].includes(action)) await api.updateTheme(action === "auto" ? "system" : action as "light" | "dark");
      else if (action === "acrylic" || action === "mica") await api.updateWindowMaterial(action);
      else if (action === "font") await api.updateUiFontSize(Number(args[0]) as UiFontSize);
      else if (action === "reset") await api.updateAppearanceColors(defaultAppearanceColors);
      else {
        if (!/^#[0-9a-f]{6}$/i.test(args[0])) throw new CatalogCommandError(t("command.invalidColor"));
        const preferences = await api.get();
        await api.updateAppearanceColors({ ...preferences.appearanceColors, [action === "main" ? "themeColor" : "accentColor"]: args[0].toUpperCase() });
      }
    } else if (domain === "lang") await api.updateLanguage(action === "auto" ? "system" : action === "cn" ? "zh-CN" : "en-US");
    else if (domain === "line") await api.updateStandbyLineVisible(action === "on");
    else if (domain === "cmd") await api.updateCommandEnabled(action === "on");
    else if (domain === "key") {
      if (action === "reset") requireCommandSuccess((await api.updateShortcutActions(defaultStableShortcutActions)).applied, t("command.defaultShortcutsUnavailable"));
      else {
        const value = await api.updateQuickActionGlobalEnabled(enabled);
        requireCommandSuccess(value.quickActionGlobalEnabled === enabled, t("command.globalShortcutsFailed"));
      }
    } else if (domain === "app") {
      const value: UserPreferences = action === "startup" ? await api.updateLaunchAtLogin(enabled) : await api.updateSystemNotifications(enabled);
      requireCommandSuccess((action === "startup" ? value.launchAtLogin : value.systemNotificationsEnabled) === enabled);
    }
    return t("catalogCommand.done");
  };
  return ["ui", "lang", "line", "cmd", "key"].includes(domain) || domain === "app" && action !== "quit" ? { run } : null;
}
