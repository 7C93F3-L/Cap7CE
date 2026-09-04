import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveLanguagePreference, setActiveLanguage } from "../../../electron/localization";
import type {
  AppearanceColors,
  DirectoryAddResult,
  DirectoryItem,
  ShortcutActionPreferences,
  ShortcutActionsUpdateResult,
  ShortcutAvailabilityResult,
  SkimDisplayPreferences,
  ThumbnailOptimizationStatus,
  UserPreferences,
  VisualCacheStats
} from "../../shared/types";
import { useRuntimeModelController } from "../controllers/useRuntimeModelController";

const emptyCacheStats: VisualCacheStats = { cacheCount: 0, totalBytes: 0, cachePaths: [] };
const emptyOptimizationStatus: ThumbnailOptimizationStatus = {
  enabled: false,
  phase: "disabled",
  queuedCount: 0,
  processedCount: 0,
  failedCount: 0,
  activeDurationMs: 0
};

export const useSettingsWindowController = () => {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [directories, setDirectories] = useState<DirectoryItem[]>([]);
  const [visualCacheStats, setVisualCacheStats] = useState(emptyCacheStats);
  const [skimCacheStats, setSkimCacheStats] = useState(emptyCacheStats);
  const [thumbnailOptimizationStatus, setThumbnailOptimizationStatus] = useState(emptyOptimizationStatus);
  const [unavailableShortcutActionIds, setUnavailableShortcutActionIds] = useState<ShortcutAvailabilityResult["unavailableActionIds"]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingCaches, setIsRefreshingCaches] = useState(false);
  const [isAddingDirectory, setIsAddingDirectory] = useState(false);
  const [error, setError] = useState("");
  const [languageRevision, setLanguageRevision] = useState(0);
  const runtime = useRuntimeModelController();

  const applyPreferences = useCallback((nextPreferences: UserPreferences | null | undefined) => {
    if (!nextPreferences) return null;
    const resolvedLanguage = resolveLanguagePreference(nextPreferences.languagePreference, navigator.language);
    setActiveLanguage(resolvedLanguage);
    setPreferences(nextPreferences);
    setLanguageRevision((revision) => revision + 1);
    return nextPreferences;
  }, []);

  const refreshCaches = useCallback(async () => {
    setIsRefreshingCaches(true);
    try {
      const [formalStats, skimStats, optimizationStatus] = await Promise.all([
        window.cap7ce?.cache.stats(),
        window.cap7ce?.skimCache.stats(),
        window.cap7ce?.cache.optimizationStatus()
      ]);
      if (formalStats) setVisualCacheStats(formalStats);
      if (skimStats) setSkimCacheStats(skimStats);
      if (optimizationStatus) setThumbnailOptimizationStatus(optimizationStatus);
    } finally {
      setIsRefreshingCaches(false);
    }
  }, []);

  const refreshDirectories = useCallback(async () => {
    const nextDirectories = await window.cap7ce?.directories.list();
    if (nextDirectories) setDirectories(nextDirectories);
    return nextDirectories ?? [];
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [nextPreferences, nextDirectories, availability] = await Promise.all([
        window.cap7ce?.preferences.get(),
        window.cap7ce?.directories.list(),
        window.cap7ce?.preferences.shortcutAvailability(),
        refreshCaches(),
        runtime.refreshLlamaRuntimeSettings(),
        runtime.refreshGgufModelSettings()
      ]);
      applyPreferences(nextPreferences);
      if (nextDirectories) setDirectories(nextDirectories);
      setUnavailableShortcutActionIds(availability?.unavailableActionIds ?? []);
    } catch {
      setError("load");
    } finally {
      setIsLoading(false);
    }
  }, [applyPreferences, refreshCaches, runtime.refreshGgufModelSettings, runtime.refreshLlamaRuntimeSettings]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => window.cap7ce?.cache.onOptimizationStatusChanged((status) => {
    setThumbnailOptimizationStatus(status);
  }), []);

  useEffect(() => window.cap7ce?.preferences.onChanged((nextPreferences) => {
    applyPreferences(nextPreferences);
  }), [applyPreferences]);

  useEffect(() => window.cap7ce?.directories.onChanged((nextDirectories) => {
    setDirectories(nextDirectories);
  }), []);

  useEffect(() => window.cap7ce?.preferences.onLanguageChanged((languagePreference, resolvedLanguage) => {
    setActiveLanguage(resolvedLanguage);
    setPreferences((current) => current ? { ...current, languagePreference } : current);
    setLanguageRevision((revision) => revision + 1);
  }), []);

  useEffect(() => {
    const refreshOnFocus = () => { void refreshAll(); };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [refreshAll]);

  const updateTheme = async (themePreference: UserPreferences["themePreference"]) => applyPreferences(await window.cap7ce?.preferences.updateTheme(themePreference));
  const updateWindowMaterial = async (material: UserPreferences["windowMaterial"]) => applyPreferences(await window.cap7ce?.preferences.updateWindowMaterial(material));
  const updateUiFontSize = async (size: UserPreferences["uiFontSize"]) => applyPreferences(await window.cap7ce?.preferences.updateUiFontSize(size));
  const updateLanguage = async (languagePreference: UserPreferences["languagePreference"]) => (
    applyPreferences(await window.cap7ce?.preferences.updateLanguage(languagePreference))
  );
  const updateAppearanceColors = async (appearanceColors: AppearanceColors) => (
    applyPreferences(await window.cap7ce?.preferences.updateAppearanceColors(appearanceColors))
  );
  const updateBooleanPreference = async (
    key: "edgeCollapseEnabled" | "standbyLineVisible" | "launchAtLogin" | "systemNotificationsEnabled" | "operationHintsEnabled" | "autoCacheOptimizationEnabled" | "aiRecognitionEnabled" | "quickActionGlobalEnabled" | "commandEnabled",
    enabled: boolean
  ) => {
    const api = window.cap7ce?.preferences;
    if (!api) return null;
    const update = {
      edgeCollapseEnabled: api.updateEdgeCollapse,
      standbyLineVisible: api.updateStandbyLineVisible,
      launchAtLogin: api.updateLaunchAtLogin,
      systemNotificationsEnabled: api.updateSystemNotifications,
      operationHintsEnabled: api.updateOperationHints,
      autoCacheOptimizationEnabled: api.updateAutoCacheOptimization,
      aiRecognitionEnabled: api.updateAiRecognitionEnabled,
      quickActionGlobalEnabled: api.updateQuickActionGlobalEnabled,
      commandEnabled: api.updateCommandEnabled
    }[key] as (value: boolean) => Promise<UserPreferences>;
    const nextPreferences = applyPreferences(await update(enabled));
    if (key === "autoCacheOptimizationEnabled") await refreshCaches();
    if (key === "quickActionGlobalEnabled") {
      const availability = await api.shortcutAvailability();
      setUnavailableShortcutActionIds(availability.unavailableActionIds);
    }
    return nextPreferences;
  };

  const updateSkimDisplay = async (skimDisplay: SkimDisplayPreferences) => (
    applyPreferences(await window.cap7ce?.preferences.updateSkimDisplay(skimDisplay))
  );
  const updateShortcutActions = async (shortcutActions: ShortcutActionPreferences): Promise<ShortcutActionsUpdateResult | null> => {
    const result = await window.cap7ce?.preferences.updateShortcutActions(shortcutActions);
    if (!result) return null;
    if (result.applied) applyPreferences(result.preferences);
    setUnavailableShortcutActionIds(result.unavailableActionIds);
    return result;
  };
  const beginShortcutCapture = async () => await window.cap7ce?.preferences.beginShortcutCapture() ?? false;
  const endShortcutCapture = async (): Promise<ShortcutAvailabilityResult> => {
    const availability = await window.cap7ce?.preferences.endShortcutCapture() ?? { unavailableActionIds: [] };
    setUnavailableShortcutActionIds(availability.unavailableActionIds);
    applyPreferences(await window.cap7ce?.preferences.get());
    return availability;
  };

  const addDirectory = async (): Promise<DirectoryAddResult | null> => {
    setIsAddingDirectory(true);
    try {
      const result = await window.cap7ce?.directories.selectAndAdd();
      if (result) setDirectories(result.directories);
      return result ?? null;
    } finally {
      setIsAddingDirectory(false);
    }
  };
  const replaceDirectoryConflicts = async (result: DirectoryAddResult) => {
    const candidates = result.conflicts.map((conflict) => conflict.candidatePath);
    if (candidates.length === 0) return result;
    setIsAddingDirectory(true);
    try {
      const nextResult = await window.cap7ce?.directories.addCandidates({ candidates, conflictResolution: "replace-existing" });
      if (nextResult) setDirectories(nextResult.directories);
      return nextResult ?? null;
    } finally {
      setIsAddingDirectory(false);
    }
  };
  const renameDirectory = async (id: string, name: string) => {
    const nextDirectories = await window.cap7ce?.directories.updateName(id, name);
    if (nextDirectories) setDirectories(nextDirectories);
    return nextDirectories ?? null;
  };
  const deleteDirectory = async (id: string) => {
    const nextDirectories = await window.cap7ce?.directories.delete(id);
    if (nextDirectories) setDirectories(nextDirectories);
    await refreshCaches();
    return nextDirectories ?? null;
  };

  const clearFormalCache = async () => {
    const token = await window.cap7ce?.cache.authorizeClear();
    if (!token) return null;
    const stats = await window.cap7ce?.cache.clearAll(token);
    if (stats) setVisualCacheStats(stats);
    applyPreferences(await window.cap7ce?.preferences.get());
    return stats ?? null;
  };
  const clearSkimCache = async () => {
    const token = await window.cap7ce?.skimCache.authorizeClear();
    if (!token) return null;
    const stats = await window.cap7ce?.skimCache.clear(token);
    if (stats) setSkimCacheStats(stats);
    return stats ?? null;
  };

  const totalFileCount = useMemo(() => directories.some((directory) => directory.fileCount === null)
    ? null
    : directories.reduce((total, directory) => total + (directory.fileCount ?? 0), 0), [directories]);

  return {
    preferences,
    directories,
    visualCacheStats,
    skimCacheStats,
    thumbnailOptimizationStatus,
    unavailableShortcutActionIds,
    isLoading,
    isRefreshingCaches,
    isAddingDirectory,
    error,
    languageRevision,
    totalFileCount,
    runtime,
    refreshAll,
    refreshCaches,
    refreshDirectories,
    updateTheme,
    updateWindowMaterial,
    updateUiFontSize,
    updateLanguage,
    updateAppearanceColors,
    updateBooleanPreference,
    updateSkimDisplay,
    updateShortcutActions,
    beginShortcutCapture,
    endShortcutCapture,
    addDirectory,
    replaceDirectoryConflicts,
    renameDirectory,
    deleteDirectory,
    clearFormalCache,
    clearSkimCache
  };
};
