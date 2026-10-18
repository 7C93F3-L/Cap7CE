import { t } from "../../../electron/localization";
import type { CatalogCommandFavorites, CatalogCommandPage, CatalogCommandOperation } from "../../shared/catalogCommandTypes";
import type { FavoriteDirectory } from "../../shared/favoriteDirectoryTypes";
import type { ParsedQuickCommand } from "../commandParser";
import { catalogPreferenceCommand } from "./catalogPreferenceCommands";
import { catalogRuntimeCommand } from "./catalogRuntimeCommands";
import { catalogPageCommand } from "./catalogPageCommands";
import { catalogFavoriteCommand } from "./catalogFavoriteCommands";
import { CatalogCommandError, requireCommandSuccess } from "./catalogCommandErrors";

export function prepareCatalogCommand(command: ParsedQuickCommand, page: CatalogCommandPage, favorites: CatalogCommandFavorites,
  open: (value: FavoriteDirectory | null) => void, aiBusy: () => boolean): CatalogCommandOperation {
  const operation = catalogPreferenceCommand(command) ?? catalogRuntimeCommand(command, aiBusy)
    ?? catalogPageCommand(command, page) ?? catalogFavoriteCommand(command, favorites, open, page);
  if (operation) return operation;
  const { domain, action, args } = command;
  if (domain === "cache") return { confirmation: t("catalogCommand.confirmCache"), run: async () => {
    const api = window.cap7ce!.cache, token = await api.authorizeClear(); requireCommandSuccess(token);
    requireCommandSuccess(await api.clearAll(token)); return t("command.cacheCleared");
  } };
  if (domain === "app" && action === "quit") return { confirmation: t("command.confirmQuit"), run: async () => {
    requireCommandSuccess(await window.cap7ce!.app.quit()); return t("command.quitting");
  } };
  return { run: async () => {
    const api = window.cap7ce!;
    if (domain === "set") requireCommandSuccess(await api.settingsWindow.open());
    else if (domain === "win") {
      if (action === "line") requireCommandSuccess(await api.window.setShellState("standby"));
      else if (action === "reset") requireCommandSuccess(await api.window.setShellState("normal", { forceBounds: true }));
      else if (action === "max") requireCommandSuccess(await api.window.toggleNormalMaximized());
      else requireCommandSuccess((await api.window.setAlwaysOnTop(args[0] === "on")).actual === (args[0] === "on"));
    } else throw new CatalogCommandError(t("catalogCommand.retired"));
    return t("catalogCommand.done");
  } };
}
