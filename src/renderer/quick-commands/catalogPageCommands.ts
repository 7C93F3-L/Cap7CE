import { t } from "../../../electron/localization";
import type { CatalogCommandPage, CatalogCommandOperation } from "../../shared/catalogCommandTypes";
import type { ParsedQuickCommand } from "../commandParser";
import { requireCommandSuccess } from "./catalogCommandErrors";

export function catalogPageCommand({ domain, action, args }: ParsedQuickCommand, page: CatalogCommandPage): CatalogCommandOperation | null {
  if (domain !== "see" || action === "dir") return null;
  const saved = (ok: boolean) => { if (!ok) page.dismissError?.(); requireCommandSuccess(ok); };
  return { run: async () => {
    if (action === "root") page.home();
    else if (action === "sort") {
      const [field, direction] = page.sort.split("-");
      const value = args[0] === "name" || args[0] === "time" ? `${args[0] === "name" ? "name" : "modified"}-${direction}`
        : `${field}-${args[0] === "asc" ? "ascending" : "descending"}`;
      saved(await page.setSort(value as CatalogCommandPage["sort"]));
    } else if (action === "hidden") saved(await page.setHidden(args[0] === "on"));
    else saved(await page.setSubfolders(args[0] === "on"));
    return t("catalogCommand.done");
  } };
}
