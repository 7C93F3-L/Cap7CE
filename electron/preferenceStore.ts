import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

type ThemeMode = "system" | "light" | "dark";
type LanguagePreference = "system" | "zh-CN" | "en-US";
type SortField = "file_name" | "modified_at";
type SortDirection = "asc" | "desc";
type AppearanceColors = {
  themeColor: string;
  accentColor: string;
};
type ShortcutActionId = "activateCapsule" | "activateMicro" | "activateMini" | "activateNormal" | "activateStandby" | "activateSkim" | "openSettings";
type ShortcutActionPreferences = Record<ShortcutActionId, string>;
type SearchLabelVisibilityPreferences = {
  directory: boolean;
  recognition: boolean;
  sort: boolean;
  format: boolean;
};

export interface UserPreferencesResponse {
  themePreference: ThemeMode;
  languagePreference: LanguagePreference;
  sortPreference: {
    sortField: SortField;
    sortDirection: SortDirection;
  };
  appearanceColors: AppearanceColors;
  edgeSnapEnabled: boolean;
  alwaysOnTop: boolean;
  standbyLineVisible: boolean;
  launchAtLogin: boolean;
  operationHintsEnabled: boolean;
  autoCacheOptimizationEnabled: boolean;
  quickActionGlobalEnabled: boolean;
  commandEnabled: boolean;
  searchLabelVisibility: SearchLabelVisibilityPreferences;
  shortcutActions: ShortcutActionPreferences;
  updatedAt: string;
}

const preferencesPath = () => path.join(app.getPath("userData"), "config", "preferences.json");

const defaultPreferences = (): UserPreferencesResponse => ({
  themePreference: "system",
  languagePreference: "system",
  sortPreference: {
    sortField: "file_name",
    sortDirection: "desc"
  },
  appearanceColors: {
    themeColor: "#7C93F3",
    accentColor: "#68C3C0"
  },
  edgeSnapEnabled: true,
  alwaysOnTop: false,
  standbyLineVisible: true,
  launchAtLogin: false,
  operationHintsEnabled: true,
  autoCacheOptimizationEnabled: true,
  quickActionGlobalEnabled: true,
  commandEnabled: true,
  searchLabelVisibility: {
    directory: true,
    recognition: true,
    sort: true,
    format: true
  },
  shortcutActions: {
    activateCapsule: "Alt+`",
    activateMicro: "Alt+1",
    activateMini: "Alt+2",
    activateNormal: "Alt+3",
    activateStandby: "Alt+4",
    activateSkim: "Alt+5",
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
const isHexColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
const isShortcutActionId = (value: string): value is ShortcutActionId => (
  value === "activateCapsule"
  || value === "activateMicro"
  || value === "activateMini"
  || value === "activateNormal"
  || value === "activateStandby"
  || value === "activateSkim"
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
      appearanceColors: normalizeAppearanceColors(parsed.appearanceColors, defaults.appearanceColors),
      edgeSnapEnabled: typeof parsed.edgeSnapEnabled === "boolean" ? parsed.edgeSnapEnabled : defaults.edgeSnapEnabled,
      alwaysOnTop: typeof parsed.alwaysOnTop === "boolean" ? parsed.alwaysOnTop : defaults.alwaysOnTop,
      standbyLineVisible: typeof parsed.standbyLineVisible === "boolean" ? parsed.standbyLineVisible : defaults.standbyLineVisible,
      launchAtLogin: typeof parsed.launchAtLogin === "boolean" ? parsed.launchAtLogin : defaults.launchAtLogin,
      operationHintsEnabled: typeof parsed.operationHintsEnabled === "boolean"
        ? parsed.operationHintsEnabled
        : defaults.operationHintsEnabled,
      autoCacheOptimizationEnabled: typeof parsed.autoCacheOptimizationEnabled === "boolean"
        ? parsed.autoCacheOptimizationEnabled
        : defaults.autoCacheOptimizationEnabled,
      quickActionGlobalEnabled: typeof parsed.quickActionGlobalEnabled === "boolean" ? parsed.quickActionGlobalEnabled : defaults.quickActionGlobalEnabled,
      commandEnabled: typeof parsed.commandEnabled === "boolean" ? parsed.commandEnabled : defaults.commandEnabled,
      searchLabelVisibility: {
        directory: typeof parsedLabelVisibility?.directory === "boolean" ? parsedLabelVisibility.directory : defaults.searchLabelVisibility.directory,
        recognition: typeof parsedLabelVisibility?.recognition === "boolean" ? parsedLabelVisibility.recognition : defaults.searchLabelVisibility.recognition,
        sort: typeof parsedLabelVisibility?.sort === "boolean" ? parsedLabelVisibility.sort : defaults.searchLabelVisibility.sort,
        format: typeof parsedLabelVisibility?.format === "boolean"
          ? parsedLabelVisibility.format
          : typeof parsed.formatLabelVisible === "boolean"
            ? parsed.formatLabelVisible
            : defaults.searchLabelVisibility.format
      },
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

export const updateEdgeSnapPreference = async (edgeSnapEnabled: boolean) => {
  const preferences = await readPreferences();
  const nextPreferences: UserPreferencesResponse = {
    ...preferences,
    edgeSnapEnabled,
    updatedAt: new Date().toISOString()
  };
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
