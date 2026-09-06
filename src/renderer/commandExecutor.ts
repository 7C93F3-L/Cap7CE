import type { AppearanceColors, LanguagePreference, ShortcutActionPreferences, SkimDisplayMode, ThemeMode, UiFontSize, WindowMaterial } from "../shared/types";
import type { ParsedQuickCommand } from "./commandParser";
import { t } from "../../electron/localization";

type CommandSortDirection = "asc" | "desc";
type CommandSortField = "file_name" | "modified_at";
type CommandOperationResult = { ok: true; message?: string } | { ok: false; message: string };

export interface QuickCommandConfirmationRequest {
  raw: string;
  message: string;
  successMessage: string;
  failureMessage: string;
  execute: () => Promise<CommandOperationResult>;
}

export type QuickCommandExecutionResult =
  | { status: "handled"; message: string; clearInput: true }
  | { status: "pending"; message: string; clearInput: true }
  | { status: "failed"; message: string; clearInput: false }
  | { status: "confirmation"; message: string; clearInput: true; confirmation: QuickCommandConfirmationRequest };

export interface QuickCommandExecutorContext {
  defaultAppearanceColors: AppearanceColors;
  defaultShortcutActions: ShortcutActionPreferences;
  currentAppearanceColors: AppearanceColors;
  openSettings: () => void;
  openSkim: () => void;
  openSkimRoot: () => void;
  updateTheme: (theme: ThemeMode) => void;
  updateWindowMaterial: (material: WindowMaterial) => Promise<void>;
  updateUiFontSize: (size: UiFontSize) => Promise<void>;
  updateLanguage: (language: LanguagePreference) => Promise<void>;
  updateAppearanceColors: (appearanceColors: AppearanceColors) => void;
  updateStandbyLineVisible: (visible: boolean) => void;
  updateEdgeCollapse: (enabled: boolean) => Promise<void>;
  updateLaunchAtLogin: (enabled: boolean) => Promise<void>;
  updateSystemNotifications: (enabled: boolean) => Promise<void>;
  updateOperationHints: (enabled: boolean) => Promise<void>;
  updateAutoCacheOptimization: (enabled: boolean) => Promise<void>;
  updateAiRecognitionEnabled: (enabled: boolean) => Promise<void>;
  updateQuickActionGlobalEnabled: (enabled: boolean) => Promise<boolean>;
  updateShortcutActions: (shortcutActions: ShortcutActionPreferences) => Promise<boolean>;
  updateCommandEnabled: (enabled: boolean) => Promise<void>;
  selectDirectory: (directoryName: string) => boolean;
  setSearchScope: (mode: SkimDisplayMode) => void;
  setSkimScope: (mode: SkimDisplayMode) => void;
  setSkimHiddenFiles: (enabled: boolean) => void;
  setSkimSortDirection: (direction: CommandSortDirection) => void;
  setSkimSortField: (field: CommandSortField) => void;
  setCurrentAiSearch: (enabled: boolean) => CommandOperationResult;
  setShellMode: () => void;
  resetWindow: () => Promise<CommandOperationResult>;
  maximizeWindow: () => Promise<CommandOperationResult>;
  setAlwaysOnTop: (enabled: boolean) => Promise<CommandOperationResult>;
  setSortDirection: (direction: CommandSortDirection) => void;
  setSortField: (field: CommandSortField) => void;
  addDirectory: (directoryPath: string) => Promise<CommandOperationResult>;
  refreshDirectoryStatus: () => Promise<CommandOperationResult>;
  refreshLlamaRuntimes: () => Promise<CommandOperationResult>;
  startLlamaRuntime: () => Promise<CommandOperationResult>;
  selectLlamaRuntime: (version: string) => Promise<CommandOperationResult>;
  refreshVisionModels: () => Promise<CommandOperationResult>;
  selectVisionModel: (modelName: string) => Promise<CommandOperationResult>;
  directoryExists: (directoryName: string) => boolean;
  deleteDirectory: (directoryName: string) => Promise<CommandOperationResult>;
  renameDirectory: (directoryName: string, nextName: string) => Promise<CommandOperationResult>;
  getLlamaStopBlocker: () => string | null;
  stopLlamaRuntime: () => Promise<CommandOperationResult>;
  clearCache: () => Promise<CommandOperationResult>;
  clearThumbnailCache: () => Promise<CommandOperationResult>;
  clearSkimCache: () => Promise<CommandOperationResult>;
  quitApp: () => Promise<CommandOperationResult>;
}

const isHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

const pending = (command: ParsedQuickCommand): QuickCommandExecutionResult => ({
  status: "pending",
  message: t("command.pending", { command: command.raw }),
  clearInput: true
});

export const executeQuickCommand = async (
  command: ParsedQuickCommand,
  context: QuickCommandExecutorContext
): Promise<QuickCommandExecutionResult> => {
  if (command.domain === "see") {
    if (command.action === "dir") {
      const directoryName = command.args[0] ?? "";
      if (!context.selectDirectory(directoryName)) {
        return { status: "failed", message: t("command.directoryNotFound"), clearInput: false };
      }
      return {
        status: "handled",
        message: directoryName.toLowerCase() === "all"
          ? t("command.allDirectoriesSelected")
          : t("command.directorySelected", { name: directoryName }),
        clearInput: true
      };
    }
    if (command.action === "scope") {
      const mode = command.args[0] === "default" ? "skim" : command.args[0] as SkimDisplayMode;
      context.setSearchScope(mode);
      const scope = mode === "skim"
        ? t("stableUi.sidebar.scopeDefault")
        : mode === "all" ? t("stableUi.sidebar.scopeAll") : t("stableUi.sidebar.scopeCustom");
      return { status: "handled", message: t("command.scopeChanged", { scope }), clearInput: true };
    }
    if (command.action === "sort") {
      if (command.args[0] === "asc" || command.args[0] === "desc") {
        context.setSortDirection(command.args[0]);
        return { status: "handled", message: command.args[0] === "asc" ? t("command.sortAsc") : t("command.sortDesc"), clearInput: true };
      }
      if (command.args[0] === "name" || command.args[0] === "time") {
        context.setSortField(command.args[0] === "name" ? "file_name" : "modified_at");
        return { status: "handled", message: command.args[0] === "name" ? t("command.sortByName") : t("command.sortByTime"), clearInput: true };
      }
    }
  }

  if (command.domain === "win") {
    if (command.action === "line") {
      context.setShellMode();
      return { status: "handled", message: t("command.windowChanged", { mode: "line" }), clearInput: true };
    }
    if (command.action === "max") {
      const result = await context.maximizeWindow();
      return result.ok
        ? { status: "handled", message: t("command.windowMaximized"), clearInput: true }
        : { status: "failed", message: result.message, clearInput: false };
    }
    if (command.action === "reset") {
      const result = await context.resetWindow();
      return result.ok
        ? { status: "handled", message: t("command.windowReset"), clearInput: true }
        : { status: "failed", message: result.message, clearInput: false };
    }
    if (command.action === "top" && (command.args[0] === "on" || command.args[0] === "off")) {
      const enabled = command.args[0] === "on";
      const result = await context.setAlwaysOnTop(enabled);
      return result.ok
        ? { status: "handled", message: enabled ? t("command.windowPinEnabled") : t("command.windowPinDisabled"), clearInput: true }
        : { status: "failed", message: result.message, clearInput: false };
    }
  }

  if (command.domain === "dir" && command.action === "add") {
    const result = await context.addDirectory(command.args[0] ?? "");
    return result.ok
      ? { status: "handled", message: result.message ?? t("command.directoryAdded"), clearInput: true }
      : { status: "failed", message: result.message, clearInput: false };
  }

  if (command.domain === "dir" && command.action === "delete") {
    const directoryName = command.args[0] ?? "";
    if (!context.directoryExists(directoryName)) {
      return { status: "failed", message: t("command.directoryNotFound"), clearInput: false };
    }
    const message = t("command.confirmDeleteDirectory", { name: directoryName });
    return {
      status: "confirmation",
      message,
      clearInput: true,
      confirmation: {
        raw: command.raw,
        message,
        successMessage: t("command.directoryDeleted", { name: directoryName }),
        failureMessage: t("command.directoryDeleteFailed"),
        execute: () => context.deleteDirectory(directoryName)
      }
    };
  }

  if (command.domain === "dir" && command.action === "rename") {
    const directoryName = command.args[0] ?? "";
    const nextName = command.args[1] ?? "";
    const result = await context.renameDirectory(directoryName, nextName);
    return result.ok
      ? { status: "handled", message: t("command.directoryRenamed", { name: nextName }), clearInput: true }
      : { status: "failed", message: result.message, clearInput: false };
  }

  if (command.domain === "dir" && command.action === "refresh") {
    const result = await context.refreshDirectoryStatus();
    return result.ok
      ? { status: "handled", message: t("command.directoryStatusRefreshed"), clearInput: true }
      : { status: "failed", message: result.message, clearInput: false };
  }

  if (command.domain === "set") {
    if (command.action === "") {
      context.openSettings();
      return { status: "handled", message: t("command.settingsOpened"), clearInput: true };
    }
  }

  if (command.domain === "skim") {
    if (command.action === "") {
      context.openSkim();
      return { status: "handled", message: t("command.skimOpened"), clearInput: true };
    }
    if (command.action === "root") {
      context.openSkimRoot();
      return { status: "handled", message: t("command.skimRootOpened"), clearInput: true };
    }
    if (command.action === "scope") {
      const mode = command.args[0] === "default" ? "skim" : command.args[0] as SkimDisplayMode;
      context.setSkimScope(mode);
      const scope = mode === "skim"
        ? t("stableUi.sidebar.scopeDefault")
        : mode === "all" ? t("stableUi.sidebar.scopeAll") : t("stableUi.sidebar.scopeCustom");
      return { status: "handled", message: t("command.skimScopeChanged", { scope }), clearInput: true };
    }
    if (command.action === "sort") {
      if (command.args[0] === "asc" || command.args[0] === "desc") {
        context.setSkimSortDirection(command.args[0]);
        return { status: "handled", message: command.args[0] === "asc" ? t("command.skimSortAsc") : t("command.skimSortDesc"), clearInput: true };
      }
      if (command.args[0] === "name" || command.args[0] === "time") {
        context.setSkimSortField(command.args[0] === "name" ? "file_name" : "modified_at");
        return { status: "handled", message: command.args[0] === "name" ? t("command.skimSortByName") : t("command.skimSortByTime"), clearInput: true };
      }
    }
    if (command.action === "hidden" && (command.args[0] === "on" || command.args[0] === "off")) {
      const enabled = command.args[0] === "on";
      context.setSkimHiddenFiles(enabled);
      return { status: "handled", message: enabled ? t("command.skimHiddenShown") : t("command.skimHiddenHidden"), clearInput: true };
    }
  }

  if (command.domain === "ui") {
    if (command.action === "light" || command.action === "dark" || command.action === "auto") {
      context.updateTheme(command.action === "auto" ? "system" : command.action);
      const themeLabel = command.action === "light" ? t("theme.lightMode") : command.action === "dark" ? t("theme.darkMode") : t("theme.system");
      return { status: "handled", message: t("command.themeChanged", { theme: themeLabel }), clearInput: true };
    }
    if (command.action === "acrylic" || command.action === "mica") {
      await context.updateWindowMaterial(command.action);
      return { status: "handled", message: command.action === "acrylic" ? t("command.materialAcrylic") : t("command.materialMica"), clearInput: true };
    }
    if (command.action === "font") {
      const size = Number(command.args[0]) as UiFontSize;
      await context.updateUiFontSize(size);
      return { status: "handled", message: t("command.uiFontSizeChanged", { size }), clearInput: true };
    }
    if (command.action === "main" || command.action === "accent") {
      const nextColor = command.args[0] ?? "";
      if (!isHexColor(nextColor)) {
        return { status: "failed", message: t("command.invalidColor"), clearInput: false };
      }

      context.updateAppearanceColors({
        ...context.currentAppearanceColors,
        [command.action === "main" ? "themeColor" : "accentColor"]: nextColor.toUpperCase()
      });
      return { status: "handled", message: command.action === "main" ? t("command.themeColorSet") : t("command.accentColorSet"), clearInput: true };
    }
    if (command.action === "reset") {
      context.updateAppearanceColors(context.defaultAppearanceColors);
      return { status: "handled", message: t("command.appearanceReset"), clearInput: true };
    }
  }

  if (command.domain === "line") {
    if (command.action === "on" || command.action === "off") {
      context.updateStandbyLineVisible(command.action === "on");
      return { status: "handled", message: command.action === "on" ? t("command.lineShown") : t("command.lineHidden"), clearInput: true };
    }
  }

  if (command.domain === "edge" && (command.action === "on" || command.action === "off")) {
    const enabled = command.action === "on";
    await context.updateEdgeCollapse(enabled);
    return { status: "handled", message: enabled ? t("command.edgeCollapseEnabled") : t("command.edgeCollapseDisabled"), clearInput: true };
  }

  if (command.domain === "key") {
    if (command.action === "global" && command.args[0] === "on") {
      const enabled = await context.updateQuickActionGlobalEnabled(true);
      return enabled
        ? { status: "handled", message: t("command.globalShortcutsEnabled"), clearInput: true }
        : { status: "failed", message: t("command.globalShortcutsFailed"), clearInput: false };
    }
    if (command.action === "global" && command.args[0] === "off") {
      await context.updateQuickActionGlobalEnabled(false);
      return { status: "handled", message: t("command.globalShortcutsDisabled"), clearInput: true };
    }
    if (command.action === "reset") {
      const updated = await context.updateShortcutActions(context.defaultShortcutActions);
      return updated
        ? { status: "handled", message: t("command.shortcutsReset"), clearInput: true }
        : { status: "failed", message: t("command.defaultShortcutsUnavailable"), clearInput: false };
    }
  }

  if (command.domain === "cmd") {
    if (command.action === "on") {
      await context.updateCommandEnabled(true);
      return { status: "handled", message: t("command.parserEnabled"), clearInput: true };
    }
    if (command.action === "off") {
      await context.updateCommandEnabled(false);
      return { status: "handled", message: t("command.parserDisabled"), clearInput: true };
    }
  }

  if (command.domain === "lang") {
    if (command.action === "auto" || command.action === "cn" || command.action === "en") {
      const language = command.action === "auto" ? "system" : command.action === "cn" ? "zh-CN" : "en-US";
      await context.updateLanguage(language);
      return {
        status: "handled",
        message: command.action === "auto"
          ? t("command.languageSystem")
          : command.action === "cn" ? t("command.languageChinese") : t("command.languageEnglish"),
        clearInput: true
      };
    }
  }

  if (command.domain === "llama") {
    if (command.action === "refresh") {
      const result = await context.refreshLlamaRuntimes();
      return result.ok
        ? { status: "handled", message: t("command.runtimeListRefreshed"), clearInput: true }
        : { status: "failed", message: result.message, clearInput: false };
    }
    if (command.action === "start") {
      const result = await context.startLlamaRuntime();
      return result.ok
        ? { status: "handled", message: t("command.runtimeStarted"), clearInput: true }
        : { status: "failed", message: result.message, clearInput: false };
    }
    if (command.action === "use") {
      const version = command.args[0] ?? "";
      const result = await context.selectLlamaRuntime(version);
      return result.ok
        ? { status: "handled", message: t("command.runtimeSelected", { name: version }), clearInput: true }
        : { status: "failed", message: result.message, clearInput: false };
    }
    if (command.action === "stop") {
      const blocker = context.getLlamaStopBlocker();
      if (blocker) {
        return { status: "failed", message: blocker, clearInput: false };
      }
      const message = t("command.confirmStopRuntime");
      return {
        status: "confirmation",
        message,
        clearInput: true,
        confirmation: {
          raw: command.raw,
          message,
          successMessage: t("command.runtimeStopped"),
          failureMessage: t("command.runtimeStopFailed"),
          execute: context.stopLlamaRuntime
        }
      };
    }
  }

  if (command.domain === "model") {
    if (command.action === "refresh") {
      const result = await context.refreshVisionModels();
      return result.ok
        ? { status: "handled", message: t("command.modelListRefreshed"), clearInput: true }
        : { status: "failed", message: result.message, clearInput: false };
    }
    if (command.action === "use") {
      const modelName = command.args[0] ?? "";
      const result = await context.selectVisionModel(modelName);
      return result.ok
        ? { status: "handled", message: t("command.modelSelected", { name: modelName }), clearInput: true }
        : { status: "failed", message: result.message, clearInput: false };
    }
  }

  if (command.domain === "cache" && command.action === "clear") {
    const message = t("command.confirmClearCache");
    return {
      status: "confirmation",
      message,
      clearInput: true,
      confirmation: {
        raw: command.raw,
        message,
        successMessage: t("command.cacheCleared"),
        failureMessage: t("command.cacheClearFailed"),
        execute: context.clearCache
      }
    };
  }

  if (command.domain === "cache" && command.action === "thumb") {
    const message = t("command.confirmClearThumbnailCache");
    return {
      status: "confirmation",
      message,
      clearInput: true,
      confirmation: {
        raw: command.raw,
        message,
        successMessage: t("command.thumbnailCacheCleared"),
        failureMessage: t("command.cacheClearFailed"),
        execute: context.clearThumbnailCache
      }
    };
  }

  if (command.domain === "cache" && command.action === "auto" && (command.args[0] === "on" || command.args[0] === "off")) {
    const enabled = command.args[0] === "on";
    await context.updateAutoCacheOptimization(enabled);
    return { status: "handled", message: enabled ? t("command.autoCacheEnabled") : t("command.autoCacheDisabled"), clearInput: true };
  }

  if (command.domain === "ai" && (command.action === "on" || command.action === "off")) {
    const enabled = command.action === "on";
    await context.updateAiRecognitionEnabled(enabled);
    return { status: "handled", message: enabled ? t("command.aiEnabled") : t("command.aiDisabled"), clearInput: true };
  }

  if (command.domain === "ai" && command.action === "search" && (command.args[0] === "on" || command.args[0] === "off")) {
    const enabled = command.args[0] === "on";
    const result = context.setCurrentAiSearch(enabled);
    return result.ok
      ? { status: "handled", message: enabled ? t("command.aiSearchEnabled") : t("command.aiSearchDisabled"), clearInput: true }
      : { status: "failed", message: result.message, clearInput: false };
  }

  if (command.domain === "cache" && command.action === "skim") {
    const message = t("command.confirmClearSkimCache");
    return {
      status: "confirmation",
      message,
      clearInput: true,
      confirmation: {
        raw: command.raw,
        message,
        successMessage: t("command.skimCacheCleared"),
        failureMessage: t("command.skimCacheClearFailed"),
        execute: context.clearSkimCache
      }
    };
  }

  if (command.domain === "app") {
    if (command.action === "startup" && (command.args[0] === "on" || command.args[0] === "off")) {
      const enabled = command.args[0] === "on";
      await context.updateLaunchAtLogin(enabled);
      return {
        status: "handled",
        message: enabled ? t("command.launchAtLoginEnabled") : t("command.launchAtLoginDisabled"),
        clearInput: true
      };
    }
    if (command.action === "hints" && (command.args[0] === "on" || command.args[0] === "off")) {
      const enabled = command.args[0] === "on";
      await context.updateOperationHints(enabled);
      return {
        status: "handled",
        message: enabled ? t("command.operationHintsEnabled") : t("command.operationHintsDisabled"),
        clearInput: true
      };
    }
    if (command.action === "notify" && (command.args[0] === "on" || command.args[0] === "off")) {
      const enabled = command.args[0] === "on";
      await context.updateSystemNotifications(enabled);
      return { status: "handled", message: enabled ? t("command.notificationsEnabled") : t("command.notificationsDisabled"), clearInput: true };
    }
    if (command.action === "quit") {
      const message = t("command.confirmQuit");
      return {
        status: "confirmation",
        message,
        clearInput: true,
        confirmation: {
          raw: command.raw,
          message,
          successMessage: t("command.quitting"),
          failureMessage: t("command.quitFailed"),
          execute: context.quitApp
        }
      };
    }
  }

  return pending(command);
};
