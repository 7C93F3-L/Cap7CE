import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { skimDefaultFileExtensionSet } from "./formatCapabilities";
import { DEFAULT_WINDOW_PRESENTATION_MODE, normalizeWindowPresentationMode, type WindowPresentationMode } from "./windowPresentationPolicy";

type ThemeMode = "system" | "light" | "dark";
type LanguagePreference = "system" | "zh-CN" | "en-US";
type SortField = "file_name" | "modified_at";
type SortDirection = "asc" | "desc";
type AppearanceColors = {
  themeColor: string;
  accentColor: string;
};
type ShortcutActionId = "activateCapsule" | "activateMicro" | "activateMini" | "activateNormal" | "activateStandby" | "activateSkim" | "cycleDirectory" | "openSettings";
type ShortcutActionPreferences = Record<ShortcutActionId, string>;
type SearchLabelVisibilityPreferences = {
  directory: boolean;
  sort: boolean;
  format: boolean;
  skimDisplay: boolean;
  ai: boolean;
};
type SkimDisplayMode = "skim" | "all" | "custom";
type SkimDisplayPreferences = {
  mode: SkimDisplayMode;
  searchMode: SkimDisplayMode;
  customExtensions: string[];
  showHiddenFiles: boolean;
};

export interface UserPreferencesResponse {
  themePreference: ThemeMode;
  languagePreference: LanguagePreference;
  sortPreference: {
    sortField: SortField;
    sortDirection: SortDirection;
  };
  skimSortPreference: {
    sortField: SortField;
    sortDirection: SortDirection;
  };
  appearanceColors: AppearanceColors;
  edgeCollapseEnabled: boolean;
  rememberWindowLayout: boolean;
  windowPresentationMode: WindowPresentationMode;
  alwaysOnTop: boolean;
  standbyLineVisible: boolean;
  launchAtLogin: boolean;
  systemNotificationsEnabled: boolean;
  backgroundRunNotificationShown: boolean;
  operationHintsEnabled: boolean;
  autoCacheOptimizationEnabled: boolean;
  aiRecognitionEnabled: boolean;
  quickActionGlobalEnabled: boolean;
  commandEnabled: boolean;
  searchLabelVisibility: SearchLabelVisibilityPreferences;
  skimDisplay: SkimDisplayPreferences;
  skimSidebarFolders: string[];
  skimSystemLocationsCollapsed: boolean;
  shortcutActions: ShortcutActionPreferences;
  updatedAt: string;
}

const preferencesPath = () => path.join(app.getPath("userData"), "config", "preferences.json");

const defaultPreferences = (): UserPreferencesResponse => ({
  themePreference: "system",
  languagePreference: "system",
  sortPreference: {
    sortField: "modified_at",
    sortDirection: "desc"
  },
  skimSortPreference: {
    sortField: "file_name",
    sortDirection: "asc"
  },
  appearanceColors: {
    themeColor: "#7C93F3",
    accentColor: "#68C3C0"
  },
  edgeCollapseEnabled: false,
  rememberWindowLayout: false,
  windowPresentationMode: DEFAULT_WINDOW_PRESENTATION_MODE,
  alwaysOnTop: false,
  standbyLineVisible: true,
  launchAtLogin: false,
  systemNotificationsEnabled: true,
  backgroundRunNotificationShown: false,
  operationHintsEnabled: true,
  autoCacheOptimizationEnabled: true,
  aiRecognitionEnabled: true,
  quickActionGlobalEnabled: true,
  commandEnabled: true,
  searchLabelVisibility: {
    directory: true,
    sort: true,
    format: true,
    skimDisplay: true,
    ai: true
  },
  skimDisplay: {
    mode: "skim",
    searchMode: "skim",
    customExtensions: [...skimDefaultFileExtensionSet],
    showHiddenFiles: false
  },
  skimSidebarFolders: [],
  skimSystemLocationsCollapsed: false,
  shortcutActions: {
    activateCapsule: "Alt+`",
    activateMicro: "Alt+1",
    activateMini: "Alt+2",
    activateNormal: "Alt+3",
    activateStandby: "Alt+4",
    activateSkim: "Alt+5",
    cycleDirectory: "Alt+Q",
    openSettings: "Alt+6"
  },
  updatedAt: new Date().toISOString()
});

const isThemeMode = (value: unknown): value is ThemeMode => value === "system" || value === "light" || value === "dark";
const isLanguagePreference = (value: unknown): value is LanguagePreference => value === "system" || value === "zh-CN" || value === "en-US";
const normalizeSortField = (value: unknown, fallback: SortField): SortField => (
  value === "modified_at" || value === "created_at"
    ? "modified_at"
    : value === "file_name"
      ? "file_name"
      : fallback
);
const isSortDirection = (value: unknown): value is SortDirection => value === "asc" || value === "desc";
const isSkimDisplayMode = (value: unknown): value is SkimDisplayMode => value === "skim" || value === "all" || value === "custom";
const normalizeSkimExtensions = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.filter((extension): extension is string => typeof extension === "string" && /^\.[a-z0-9]+$/i.test(extension)).map((extension) => extension.toLowerCase()))]
  : [];
const normalizePathKey = (value: string) => path.resolve(value).replace(/[\\/]+$/, "").toLowerCase();
const getStandardSkimLocationPathKeys = () => new Set([
  app.getPath("desktop"),
  app.getPath("downloads"),
  app.getPath("documents"),
  app.getPath("pictures"),
  app.getPath("music"),
  app.getPath("videos")
].map(normalizePathKey));
export const normalizeSkimSidebarFolders = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const standardPaths = getStandardSkimLocationPathKeys();
  const seen = new Set<string>();
  const folders: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string" || candidate.includes("\0")) continue;
    const trimmed = candidate.trim();
    if (!trimmed || !path.isAbsolute(trimmed)) continue;
    const resolved = path.resolve(trimmed);
    const key = normalizePathKey(resolved);
    if (!key || key === normalizePathKey(path.parse(resolved).root) || standardPaths.has(key) || seen.has(key)) continue;
    seen.add(key);
    folders.push(resolved);
    if (folders.length >= 50) break;
  }
  return folders;
};
const isHexColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
const isShortcutActionId = (value: string): value is ShortcutActionId => (
  value === "activateCapsule"
  || value === "activateMicro"
  || value === "activateMini"
  || value === "activateNormal"
  || value === "activateStandby"
  || value === "activateSkim"
  || value === "cycleDirectory"
  || value === "openSettings"
);
const isShortcutValue = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isReservedEscapeShortcut = (value: string) => /(^|\+)(esc|escape)$/i.test(value.replace(/\s+/g, ""));

const normalizeAppearanceColors = (appearanceColors: unknown, defaults = defaultPreferences().appearanceColors): AppearanceColors => {
  const parsedColors = appearanceColors as (Partial<AppearanceColors> & {
    light?: Partial<AppearanceColors>;
    dark?: Partial<AppearanceColors>;
  }) | undefined;
  const migratedColors = parsedColors?.light ?? parsedColors?.dark;
  return {
    themeColor: isHexColor(parsedColors?.themeColor)
      ? parsedColors.themeColor.toUpperCase()
      : isHexColor(migratedColors?.themeColor)
        ? migratedColors.themeColor.toUpperCase()
        : defaults.themeColor,
    accentColor: isHexColor(parsedColors?.accentColor)
      ? parsedColors.accentColor.toUpperCase()
      : isHexColor(migratedColors?.accentColor)
        ? migratedColors.accentColor.toUpperCase()
        : defaults.accentColor
  };
};

const normalizeShortcutActions = (
  shortcutActions: unknown,
  defaults = defaultPreferences().shortcutActions
): ShortcutActionPreferences => {
  const parsedShortcuts = shortcutActions as Partial<Record<string, unknown>> | undefined;
  if (!parsedShortcuts || !isShortcutValue(parsedShortcuts.activateSkim)) {
    return { ...defaults };
  }
  return (Object.keys(defaults) as ShortcutActionId[]).reduce<ShortcutActionPreferences>((currentShortcuts, shortcutId) => {
    const shortcutValue = parsedShortcuts && isShortcutActionId(shortcutId) ? parsedShortcuts[shortcutId] : undefined;
    return {
      ...currentShortcuts,
      [shortcutId]: isShortcutValue(shortcutValue) && !isReservedEscapeShortcut(shortcutValue)
        ? shortcutValue
        : defaults[shortcutId]
    };
  }, { ...defaults });
};

const readPreferences = async (): Promise<UserPreferencesResponse> => {
  try {
    const content = await fs.readFile(preferencesPath(), "utf8");
    const parsed = JSON.parse(content) as Partial<UserPreferencesResponse> & { formatLabelVisible?: boolean };
    const defaults = defaultPreferences();
    const parsedLabelVisibility = parsed.searchLabelVisibility;

    return {
      themePreference: isThemeMode(parsed.themePreference) ? parsed.themePreference : defaults.themePreference,
      languagePreference: isLanguagePreference(parsed.languagePreference) ? parsed.languagePreference : defaults.languagePreference,
      sortPreference: {
        sortField: normalizeSortField(parsed.sortPreference?.sortField, defaults.sortPreference.sortField),
        sortDirection: isSortDirection(parsed.sortPreference?.sortDirection) ? parsed.sortPreference.sortDirection : defaults.sortPreference.sortDirection
      },
      skimSortPreference: {
        sortField: normalizeSortField(parsed.skimSortPreference?.sortField, defaults.skimSortPreference.sortField),
        sortDirection: isSortDirection(parsed.skimSortPreference?.sortDirection)
          ? parsed.skimSortPreference.sortDirection
          : defaults.skimSortPreference.sortDirection
      },
      appearanceColors: normalizeAppearanceColors(parsed.appearanceColors, defaults.appearanceColors),
      edgeCollapseEnabled: typeof parsed.edgeCollapseEnabled === "boolean" ? parsed.edgeCollapseEnabled : defaults.edgeCollapseEnabled,
      rememberWindowLayout: typeof parsed.rememberWindowLayout === "boolean" ? parsed.rememberWindowLayout : defaults.rememberWindowLayout,
      windowPresentationMode: normalizeWindowPresentationMode(parsed.windowPresentationMode),
      alwaysOnTop: typeof parsed.alwaysOnTop === "boolean" ? parsed.alwaysOnTop : defaults.alwaysOnTop,
      standbyLineVisible: typeof parsed.standbyLineVisible === "boolean" ? parsed.standbyLineVisible : defaults.standbyLineVisible,
      launchAtLogin: typeof parsed.launchAtLogin === "boolean" ? parsed.launchAtLogin : defaults.launchAtLogin,
      systemNotificationsEnabled: typeof parsed.systemNotificationsEnabled === "boolean"
        ? parsed.systemNotificationsEnabled
        : defaults.systemNotificationsEnabled,
      backgroundRunNotificationShown: typeof parsed.backgroundRunNotificationShown === "boolean"
        ? parsed.backgroundRunNotificationShown
        : defaults.backgroundRunNotificationShown,
      operationHintsEnabled: typeof parsed.operationHintsEnabled === "boolean"
        ? parsed.operationHintsEnabled
        : defaults.operationHintsEnabled,
      autoCacheOptimizationEnabled: typeof parsed.autoCacheOptimizationEnabled === "boolean"
        ? parsed.autoCacheOptimizationEnabled
        : defaults.autoCacheOptimizationEnabled,
      aiRecognitionEnabled: typeof parsed.aiRecognitionEnabled === "boolean"
        ? parsed.aiRecognitionEnabled
        : defaults.aiRecognitionEnabled,
      quickActionGlobalEnabled: typeof parsed.quickActionGlobalEnabled === "boolean" ? parsed.quickActionGlobalEnabled : defaults.quickActionGlobalEnabled,
      commandEnabled: typeof parsed.commandEnabled === "boolean" ? parsed.commandEnabled : defaults.commandEnabled,
      searchLabelVisibility: {
        directory: typeof parsedLabelVisibility?.directory === "boolean" ? parsedLabelVisibility.directory : defaults.searchLabelVisibility.directory,
        sort: typeof parsedLabelVisibility?.sort === "boolean" ? parsedLabelVisibility.sort : defaults.searchLabelVisibility.sort,
        format: typeof parsedLabelVisibility?.format === "boolean"
          ? parsedLabelVisibility.format
          : typeof parsed.formatLabelVisible === "boolean"
            ? parsed.formatLabelVisible
            : defaults.searchLabelVisibility.format,
        skimDisplay: typeof parsedLabelVisibility?.skimDisplay === "boolean"
          ? parsedLabelVisibility.skimDisplay
          : defaults.searchLabelVisibility.skimDisplay,
        ai: typeof parsedLabelVisibility?.ai === "boolean"
          ? parsedLabelVisibility.ai
          : defaults.searchLabelVisibility.ai
      },
      skimDisplay: {
        mode: isSkimDisplayMode(parsed.skimDisplay?.mode) ? parsed.skimDisplay.mode : defaults.skimDisplay.mode,
        searchMode: isSkimDisplayMode(parsed.skimDisplay?.searchMode) ? parsed.skimDisplay.searchMode : defaults.skimDisplay.searchMode,
        customExtensions: Array.isArray(parsed.skimDisplay?.customExtensions)
          ? normalizeSkimExtensions(parsed.skimDisplay.customExtensions)
          : defaults.skimDisplay.customExtensions,
        showHiddenFiles: typeof parsed.skimDisplay?.showHiddenFiles === "boolean"
          ? parsed.skimDisplay.showHiddenFiles
          : defaults.skimDisplay.showHiddenFiles
      },
      skimSidebarFolders: normalizeSkimSidebarFolders(parsed.skimSidebarFolders),
      skimSystemLocationsCollapsed: typeof parsed.skimSystemLocationsCollapsed === "boolean"
        ? parsed.skimSystemLocationsCollapsed
        : defaults.skimSystemLocationsCollapsed,
      shortcutActions: normalizeShortcutActions(parsed.shortcutActions, defaults.shortcutActions),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : defaults.updatedAt
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }

    return defaultPreferences();
  }
};

const savePreferences = async (preferences: UserPreferencesResponse) => {
  const targetPath = preferencesPath();
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
};

export const getUserPreferences = async () => readPreferences();

export const updateThemePreference = async (themePreference: ThemeMode) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    themePreference,
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateLanguagePreference = async (languagePreference: LanguagePreference) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    languagePreference,
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateSortPreference = async (sortPreference: UserPreferencesResponse["sortPreference"]) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    sortPreference,
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateSkimSortPreference = async (skimSortPreference: UserPreferencesResponse["skimSortPreference"]) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    skimSortPreference: {
      sortField: normalizeSortField(skimSortPreference?.sortField, preferences.skimSortPreference.sortField),
      sortDirection: isSortDirection(skimSortPreference?.sortDirection)
        ? skimSortPreference.sortDirection
        : preferences.skimSortPreference.sortDirection
    },
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateAppearanceColorsPreference = async (appearanceColors: UserPreferencesResponse["appearanceColors"]) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    appearanceColors: normalizeAppearanceColors(appearanceColors),
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateRememberWindowLayoutPreference = async (rememberWindowLayout: boolean) => {
  const preferences = await readPreferences();
  const nextPreferences = { ...preferences, rememberWindowLayout, updatedAt: new Date().toISOString() };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateWindowPresentationModePreference = async (windowPresentationMode: WindowPresentationMode) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    windowPresentationMode: normalizeWindowPresentationMode(windowPresentationMode),
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateEdgeCollapsePreference = async (edgeCollapseEnabled: boolean) => {
  const preferences = await readPreferences();
  const nextPreferences = { ...preferences, edgeCollapseEnabled, updatedAt: new Date().toISOString() };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateAlwaysOnTopPreference = async (alwaysOnTop: boolean) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    alwaysOnTop,
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateStandbyLineVisiblePreference = async (standbyLineVisible: boolean) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    standbyLineVisible,
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateLaunchAtLoginPreference = async (launchAtLogin: boolean) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    launchAtLogin,
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateSystemNotificationsPreference = async (systemNotificationsEnabled: boolean) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    systemNotificationsEnabled,
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const markBackgroundRunNotificationShown = async () => {
  const preferences = await readPreferences();
  if (preferences.backgroundRunNotificationShown) return preferences;
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    backgroundRunNotificationShown: true,
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateOperationHintsPreference = async (operationHintsEnabled: boolean) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    operationHintsEnabled,
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateAutoCacheOptimizationPreference = async (autoCacheOptimizationEnabled: boolean) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    autoCacheOptimizationEnabled,
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateAiRecognitionEnabledPreference = async (aiRecognitionEnabled: boolean) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    aiRecognitionEnabled,
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateQuickActionGlobalEnabledPreference = async (quickActionGlobalEnabled: boolean) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    quickActionGlobalEnabled,
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateCommandEnabledPreference = async (commandEnabled: boolean) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    commandEnabled,
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateSearchLabelVisibilityPreference = async (searchLabelVisibility: SearchLabelVisibilityPreferences) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    searchLabelVisibility,
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateSkimDisplayPreference = async (skimDisplay: SkimDisplayPreferences) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    skimDisplay: {
      mode: isSkimDisplayMode(skimDisplay?.mode) ? skimDisplay.mode : preferences.skimDisplay.mode,
      searchMode: isSkimDisplayMode(skimDisplay?.searchMode) ? skimDisplay.searchMode : preferences.skimDisplay.searchMode,
      customExtensions: normalizeSkimExtensions(skimDisplay?.customExtensions),
      showHiddenFiles: Boolean(skimDisplay?.showHiddenFiles)
    },
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateSkimSidebarFoldersPreference = async (skimSidebarFolders: string[]) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    skimSidebarFolders: normalizeSkimSidebarFolders(skimSidebarFolders),
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateSkimSystemLocationsCollapsedPreference = async (skimSystemLocationsCollapsed: boolean) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    skimSystemLocationsCollapsed: Boolean(skimSystemLocationsCollapsed),
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};

export const updateShortcutActionsPreference = async (shortcutActions: UserPreferencesResponse["shortcutActions"]) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    shortcutActions: normalizeShortcutActions(shortcutActions),
    updatedAt: new Date().toISOString()
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
};
