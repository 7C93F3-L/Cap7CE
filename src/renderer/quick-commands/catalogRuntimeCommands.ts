import { t } from "../../../electron/localization";
import type { CatalogCommandOperation } from "../../shared/catalogCommandTypes";
import type { ParsedQuickCommand } from "../commandParser";
import { CatalogCommandError, requireCommandSuccess } from "./catalogCommandErrors";

export function catalogRuntimeCommand({ domain, action, args }: ParsedQuickCommand, aiBusy: () => boolean): CatalogCommandOperation | null {
  if (domain !== "llama" && domain !== "model") return null;
  return { confirmation: action === "stop" ? t("command.confirmStopRuntime") : undefined, run: async () => {
    const api = window.cap7ce!;
    if (domain === "llama") {
      if (action === "refresh") await api.llamaRuntime.settings();
      else if (action === "use") {
        const settings = await api.llamaRuntime.settings(), matches = settings.versions.filter(item => item.version.toLowerCase() === args[0].toLowerCase());
        if (matches.length !== 1) throw new CatalogCommandError(t("catalogCommand.runtimeNotFound"));
        requireCommandSuccess((await api.llamaRuntime.updateSelected(matches[0].version)).selectedVersion === matches[0].version);
      } else if (action === "start") requireCommandSuccess((await api.llamaRuntime.start()).status === "running", t("error.runtimeStartFailed"));
      else {
        if (aiBusy()) throw new CatalogCommandError(t("catalogCommand.aiBusy"));
        requireCommandSuccess((await api.llamaRuntime.stop()).status === "stopped", t("command.runtimeStopFailed"));
      }
    } else if (action === "refresh") await api.ggufModels.settings();
    else {
      const settings = await api.ggufModels.settings(), matches = settings.models.filter(model => model.id.toLowerCase() === args[0].toLowerCase() || model.name.toLowerCase() === args[0].toLowerCase());
      if (matches.length !== 1 || !matches[0].loadable) throw new CatalogCommandError(t("catalogCommand.modelNotFound"));
      requireCommandSuccess((await api.ggufModels.updateSelected(matches[0].id)).selectedModelId === matches[0].id);
    }
    return t("catalogCommand.done");
  } };
}
