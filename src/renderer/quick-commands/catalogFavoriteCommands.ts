import { t } from "../../../electron/localization";
import type { CatalogCommandFavorites, CatalogCommandOperation, CatalogCommandPage } from "../../shared/catalogCommandTypes";
import type { FavoriteDirectory } from "../../shared/favoriteDirectoryTypes";
import type { ParsedQuickCommand } from "../commandParser";
import { CatalogCommandError, requireCommandSuccess } from "./catalogCommandErrors";
import { normalizeWindowsPathKey } from "../filePath";

export function catalogFavoriteCommand({ domain, action, args }: ParsedQuickCommand, favorites: CatalogCommandFavorites,
  open: (value: FavoriteDirectory | null) => void, page: CatalogCommandPage): CatalogCommandOperation | null {
  if (domain !== "dir" && !(domain === "see" && action === "dir")) return null;
  const find = () => {
    const key = args[0].toLowerCase(), pathKey = normalizeWindowsPathKey(args[0]), matches = favorites.directories.filter(item => item.name.toLowerCase() === key || normalizeWindowsPathKey(item.path) === pathKey);
    if (matches.length !== 1) throw new CatalogCommandError(t("catalogCommand.favoriteNotFound"));
    return matches[0];
  };
  if (action === "remove") {
    const item = find();
    return { confirmation: t("catalogCommand.confirmRemove", { name: item.name }), run: async () => {
      requireCommandSuccess(await favorites.remove(item.id)); return t("catalogCommand.done");
    } };
  }
  return { run: async () => {
    if (domain === "see") open(args[0].toLowerCase() === "all" ? null : find());
    else if (action === "add") requireCommandSuccess(await favorites.add(args[0]));
    else if (action === "rename") requireCommandSuccess(await favorites.rename(find().id, args[1]));
    else { requireCommandSuccess(await favorites.reload()); requireCommandSuccess(await page.refresh()); }
    return t("catalogCommand.done");
  } };
}
