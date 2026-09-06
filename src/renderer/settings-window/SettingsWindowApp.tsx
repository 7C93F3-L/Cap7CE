import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getActiveLanguage, t, type TranslationKey } from "../../../electron/localization";
import type { LlamaRuntimeSettings, UserPreferences } from "../../shared/types";
import CustomScrollbar from "../CustomScrollbar";
import StableUiIcon from "../stable-ui/StableUiIcon";
import { getTextColorForBackground } from "../appearance";
import { getFileContextMenuStyle } from "../fileContextMenuShared";
import { formatCacheSize } from "../formatting";
import { defaultUiFontSize, useUiFontSize } from "../typography";
import { EmbeddedMetadataSettingsRow } from "../settings/EmbeddedMetadataSettingsRow";
import { QuickActionSettingsRows } from "../settings/QuickActionSettingsRows";
import { QuickCommandSettingsRows } from "../settings/QuickCommandSettingsRows";
import { RuntimeDiagnosticsRows } from "../settings/RuntimeDiagnosticsRows";
import { SettingsFooter } from "../settings/SettingsFooter";
import { SkimDisplaySettingsRows } from "../settings/SkimDisplaySettingsRows";
import { SettingsWindowUpdateControl } from "./SettingsWindowUpdateControl";
import SettingsConfirmationDialog from "./SettingsConfirmationDialog";
import FontSizeSetting from "./FontSizeSetting";
import AppearanceColorSettingsControl from "./AppearanceColorSettingsControl";
import StableSettingsSelect from "./StableSettingsSelect";
import SettingsCategoryIcon, { type SettingsCategoryIconName } from "./SettingsCategoryIcon";
import { useSettingsWindowController } from "./useSettingsWindowController";
import "./SettingsWindowApp.css";
import "./StableSettingsActions.css";
import "./StableQuickActionSettings.css";
import "./StableQuickCommandSettings.css";
import "./StableRuntimeDiagnostics.css";
import "./StableSkimDisplaySettingsRows.css";
import "../stable-ui/StableMaterialContrast.css";
type CategoryId = "general" | "appearance" | "browse" | "search-ai" | "cache" | "shortcuts" | "diagnostics" | "about";
type DialogState = { message: string; confirmLabel?: string; action: () => Promise<unknown> } | null;
const categoryDefinitions: Array<{ id: CategoryId; label: TranslationKey; icon: SettingsCategoryIconName }> = [
  { id: "general", label: "stableSettings.category.general", icon: "general" },
  { id: "appearance", label: "stableSettings.category.appearance", icon: "appearance" },
  { id: "browse", label: "settings.skimDisplay", icon: "browse" },
  { id: "cache", label: "stableSettings.category.cache", icon: "cache" },
  { id: "shortcuts", label: "stableSettings.category.shortcuts", icon: "shortcuts" },
  { id: "search-ai", label: "stableSettings.category.searchAi", icon: "search-ai" },
  { id: "diagnostics", label: "stableSettings.category.diagnostics", icon: "diagnostics" },
  { id: "about", label: "stableSettings.category.about", icon: "about" }
];
const categorySearchKeys: Record<CategoryId, TranslationKey[]> = {
  general: ["stableSettings.category.general", "settings.language", "settings.launchAtLogin", "settings.systemNotifications", "settings.operationHints", "settings.edgeCollapse", "settings.standbyLine", "stableSettings.desc.language", "stableSettings.desc.launch", "stableSettings.desc.notifications", "stableSettings.desc.hints", "stableSettings.desc.edgeCollapse", "stableSettings.desc.line"],
  appearance: ["stableSettings.category.appearance", "stableSettings.material", "stableSettings.uiFontSize", "appearance.themeModeLabel", "appearance.themeColor", "appearance.accentColor", "stableSettings.desc.material", "stableSettings.desc.uiFontSize", "stableSettings.desc.theme", "stableSettings.desc.colors"],
  browse: ["settings.skimDisplay", "stableSettings.desc.skimDisplay"],
  "search-ai": ["stableSettings.category.searchAi", "search.aiEnhance", "settings.selectRuntime", "settings.visionModel", "stableSettings.idleUnload", "stableSettings.runtimeInfo", "stableSettings.desc.ai", "stableSettings.desc.runtime", "stableSettings.desc.model", "stableSettings.desc.idleUnload", "stableSettings.desc.runtimeInfo"],
  cache: ["stableSettings.category.cache", "stableSettings.cacheOptimization", "stableSettings.formalCache", "settings.skimCache", "settings.embeddedMetadata", "stableSettings.desc.cacheOptimization", "stableSettings.desc.formalCache", "stableSettings.desc.skimCache", "stableSettings.desc.metadata"],
  shortcuts: ["stableSettings.category.shortcuts", "settings.quickActions", "settings.quickCommands", "stableSettings.desc.quickActions", "stableSettings.desc.quickCommands"],
  diagnostics: ["stableSettings.category.diagnostics", "stableSettings.diagnostics", "settings.applicationLog", "settings.crashReports", "settings.diagnosticsBundle", "stableSettings.desc.diagnostics"],
  about: ["stableSettings.category.about", "stableSettings.currentVersion", "settings.versionUpdate", "stableSettings.license", "stableSettings.desc.version", "stableSettings.desc.update", "stableSettings.desc.license"]
};

const matchesQuery = (query: string, values: string[]) => {
  const normalized = query.trim().toLocaleLowerCase();
  return !normalized || values.some((value) => value.toLocaleLowerCase().includes(normalized));
};
const getLlamaRuntimeStatusLabel = (settings: LlamaRuntimeSettings) => {
  if (settings.status === "available") return t("common.available");
  if (settings.status === "unselected") return t("common.unselected");
  if (settings.status === "missing_root") return t("runtime.rootMissing");
  if (settings.status === "missing_server") return t("runtime.noneFound");
  return t("runtime.selectionMissing");
};
const SettingsSection = ({ title, children }: { title: TranslationKey; children: ReactNode }) => (
  <section className="cap-stable-settings-section"><h2>{t(title)}</h2><div className="cap-stable-settings-section-cards">{children}</div></section>
);

const SettingCard = ({ title, description, query, keywords = [], children, className = "" }: {
  title: TranslationKey; description: TranslationKey; query: string; keywords?: string[]; children: ReactNode; className?: string;
}) => matchesQuery(query, [t(title), t(description), ...keywords]) ? (
  <div className={`cap-stable-settings-card${className ? ` ${className}` : ""}`}>
    <div className="cap-stable-settings-copy"><h3>{t(title)}</h3><p>{t(description)}</p></div>
    <div className="cap-stable-settings-control">{children}</div>
  </div>
) : null;

const SettingsToggle = ({ enabled, onChange, disabled = false }: { enabled: boolean; onChange: (enabled: boolean) => void; disabled?: boolean }) => (
  <button type="button" className="cap-stable-settings-toggle" role="switch" aria-checked={enabled} data-checked={enabled} disabled={disabled} onClick={() => onChange(!enabled)}>
    <span>{enabled ? t("common.enabled") : t("common.disabled")}</span><i aria-hidden="true" />
  </button>
);

const SettingsWindowApp = () => {
  const controller = useSettingsWindowController();
  const { preferences, runtime } = controller;
  const [activeCategory, setActiveCategory] = useState<CategoryId>("general");
  const [query, setQuery] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchCompositionRef = useRef(false);
  const normalizedQuery = filterQuery.trim();
  const uiFontStyle = useUiFontSize(preferences?.uiFontSize ?? defaultUiFontSize);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const visibleCategories = useMemo(() => categoryDefinitions.filter((category) => matchesQuery(filterQuery, categorySearchKeys[category.id].map((key) => t(key)))), [filterQuery, controller.languageRevision]);
  useEffect(() => {
    if (visibleCategories.some((category) => category.id === activeCategory)) return;
    if (visibleCategories[0]) setActiveCategory(visibleCategories[0].id);
  }, [activeCategory, visibleCategories]);

  if (controller.isLoading || !preferences) {
    return <div className="cap-settings-window-foundation cap-stable-settings-loading"><div className="cap-settings-window-drag-region" aria-hidden="true" /><p>{controller.error ? t("stableSettings.loadFailed") : t("stableSettings.loading")}</p>{controller.error && <button type="button" onClick={() => void controller.refreshAll()}>{t("common.retry")}</button>}</div>;
  }

  const effectiveTheme = preferences.themePreference === "system" ? (systemDark ? "dark" : "light") : preferences.themePreference;
  const shownCategories = normalizedQuery ? visibleCategories : categoryDefinitions.filter((category) => category.id === activeCategory);
  const menuStyle = { ...getFileContextMenuStyle(effectiveTheme, preferences.appearanceColors), ...uiFontStyle, "--context-menu-theme-color": preferences.appearanceColors.themeColor, "--context-menu-accent-color": preferences.appearanceColors.accentColor, "--stable-settings-theme-color": preferences.appearanceColors.themeColor, "--stable-settings-focus": preferences.appearanceColors.accentColor, "--dialog-action-hover-text": getTextColorForBackground(preferences.appearanceColors.themeColor, preferences.appearanceColors.accentColor) } as CSSProperties;
  const toggle = (key: Parameters<typeof controller.updateBooleanPreference>[0], enabled: boolean) => { void controller.updateBooleanPreference(key, enabled); };
  const openConfirmation = (message: string, action: () => Promise<unknown>) => setDialog({ message, action });
  const confirmDialog = async () => {
    if (!dialog || dialogBusy) return;
    setDialogBusy(true);
    try { await dialog.action(); setDialog(null); } finally { setDialogBusy(false); }
  };
  const renderCategory = (category: CategoryId) => {
    if (category === "general") return <>
      <SettingsSection title="stableSettings.section.basics">
        <SettingCard title="settings.language" description="stableSettings.desc.language" query={normalizedQuery}><StableSettingsSelect menuStyle={menuStyle} label={t("settings.language")} value={preferences.languagePreference} options={[{ value: "system", label: getActiveLanguage() === "zh-CN" ? "跟随系统" : "Use System Setting" }, { value: "zh-CN", label: "中文" }, { value: "en-US", label: "English" }]} onChange={(value) => void controller.updateLanguage(value as UserPreferences["languagePreference"])} /></SettingCard>
        <SettingCard title="settings.launchAtLogin" description="stableSettings.desc.launch" query={normalizedQuery}><SettingsToggle enabled={preferences.launchAtLogin} onChange={(enabled) => toggle("launchAtLogin", enabled)} /></SettingCard>
        <SettingCard title="settings.systemNotifications" description="stableSettings.desc.notifications" query={normalizedQuery}><SettingsToggle enabled={preferences.systemNotificationsEnabled} onChange={(enabled) => toggle("systemNotificationsEnabled", enabled)} /></SettingCard>
        <SettingCard title="settings.operationHints" description="stableSettings.desc.hints" query={normalizedQuery}><SettingsToggle enabled={preferences.operationHintsEnabled} onChange={(enabled) => toggle("operationHintsEnabled", enabled)} /></SettingCard>
      </SettingsSection>
      <SettingsSection title="stableSettings.section.windows">
        <SettingCard title="settings.edgeCollapse" description="stableSettings.desc.edgeCollapse" query={normalizedQuery}><SettingsToggle enabled={preferences.edgeCollapseEnabled} onChange={(enabled) => toggle("edgeCollapseEnabled", enabled)} /></SettingCard>
        <SettingCard title="settings.standbyLine" description="stableSettings.desc.line" query={normalizedQuery}><SettingsToggle enabled={preferences.standbyLineVisible} onChange={(enabled) => toggle("standbyLineVisible", enabled)} /></SettingCard>
      </SettingsSection>
    </>;
    if (category === "appearance") return <>
      <SettingsSection title="stableSettings.section.colors">
        <SettingCard title="stableSettings.material" description="stableSettings.desc.material" query={normalizedQuery}><StableSettingsSelect menuStyle={menuStyle} label={t("stableSettings.material")} value={preferences.windowMaterial} options={[{ value: "acrylic", label: t("stableSettings.material.acrylic") }, { value: "mica", label: t("stableSettings.material.mica") }]} onChange={(value) => void controller.updateWindowMaterial(value as UserPreferences["windowMaterial"])} /></SettingCard>
        <SettingCard title="appearance.themeModeLabel" description="stableSettings.desc.theme" query={normalizedQuery}><StableSettingsSelect menuStyle={menuStyle} label={t("appearance.themeModeLabel")} value={preferences.themePreference} options={[{ value: "system", label: t("theme.system") }, { value: "light", label: t("theme.light") }, { value: "dark", label: t("theme.dark") }]} onChange={(value) => void controller.updateTheme(value as UserPreferences["themePreference"])} /></SettingCard>
        <SettingCard title="appearance.configureLabel" description="stableSettings.desc.colors" query={normalizedQuery}><AppearanceColorSettingsControl appearanceColors={preferences.appearanceColors} menuStyle={menuStyle} onPreview={controller.previewAppearanceColors} onChange={(colors) => void controller.updateAppearanceColors(colors)} /></SettingCard>
        <SettingCard title="stableSettings.uiFontSize" description="stableSettings.desc.uiFontSize" query={normalizedQuery}><FontSizeSetting value={preferences.uiFontSize} onChange={(value) => void controller.updateUiFontSize(value)} /></SettingCard>
      </SettingsSection>
    </>;
    if (category === "browse") return <SkimDisplaySettingsRows stableUi skimDisplay={preferences.skimDisplay} onSkimDisplayChange={(next) => void controller.updateSkimDisplay(next)} />;
    if (category === "search-ai") return <SettingsSection title="stableSettings.section.ai">
      <SettingCard title="search.aiEnhance" description="stableSettings.desc.ai" query={normalizedQuery}><SettingsToggle enabled={preferences.aiRecognitionEnabled} onChange={(enabled) => toggle("aiRecognitionEnabled", enabled)} /></SettingCard>
      <SettingCard title="settings.selectRuntime" description="stableSettings.desc.runtime" query={normalizedQuery}><div className="cap-stable-settings-action-line cap-stable-settings-model-line"><StableSettingsSelect menuStyle={menuStyle} label={t("settings.selectRuntime")} value={runtime.llamaRuntimeSettings.selectedVersion} disabled={runtime.llamaRuntimeProcessState.status === "running" || runtime.llamaRuntimeProcessState.status === "starting"} options={[{ value: "", label: t("settings.selectVersion") }, ...runtime.llamaRuntimeSettings.versions.map((item) => ({ value: item.version, label: item.version }))]} onChange={(value) => void runtime.updateSelectedLlamaRuntime(value)} /><div className="cap-stable-settings-model-actions"><button type="button" className="cap-stable-settings-button" disabled={runtime.isChangingLlamaRuntimeState || runtime.llamaRuntimeProcessState.status === "starting"} onClick={() => void (runtime.llamaRuntimeProcessState.status === "running" ? runtime.stopLlamaRuntimeServer() : runtime.startLlamaRuntimeServer())}>{runtime.llamaRuntimeProcessState.status === "running" ? t("common.stop") : t("common.start")}</button><button type="button" className="cap-stable-settings-button" disabled={runtime.isLoadingLlamaRuntime} onClick={() => void runtime.refreshLlamaRuntimeSettings()}>{t("common.refresh")}</button></div></div></SettingCard>
      <SettingCard title="settings.visionModel" description="stableSettings.desc.model" query={normalizedQuery}><div className="cap-stable-settings-action-line cap-stable-settings-model-line"><StableSettingsSelect menuStyle={menuStyle} label={t("settings.selectVisionModel")} value={runtime.ggufModelSettings.selectedModelId} disabled={runtime.llamaRuntimeProcessState.status === "running" || runtime.llamaRuntimeProcessState.status === "starting"} options={[{ value: "", label: t("settings.selectVisionModel") }, ...runtime.ggufModelSettings.models.map((model) => ({ value: model.id, label: model.name }))]} onChange={(value) => void runtime.updateSelectedGgufModel(value)} /><div className="cap-stable-settings-model-actions"><button type="button" className="cap-stable-settings-button" disabled={runtime.isLoadingGgufModels} onClick={() => void runtime.refreshGgufModelSettings()}>{t("common.refresh")}</button></div></div></SettingCard>
      <SettingCard title="stableSettings.idleUnload" description="stableSettings.desc.idleUnload" query={normalizedQuery}><span className="cap-stable-settings-readonly">{t("stableSettings.idleUnload.readOnly")}</span></SettingCard>
      <SettingCard title="stableSettings.runtimeInfo" description="stableSettings.desc.runtimeInfo" query={normalizedQuery} className="cap-stable-settings-card-expanded"><dl className="cap-stable-settings-runtime-info"><div><dt>{t("settings.runtimeFileStatus")}</dt><dd>{getLlamaRuntimeStatusLabel(runtime.llamaRuntimeSettings)}</dd></div><div><dt>{t("settings.serviceAddress")}</dt><dd>{runtime.llamaRuntimeProcessState.port ? `${runtime.llamaRuntimeProcessState.host}:${runtime.llamaRuntimeProcessState.port}` : t("common.stopped")}</dd></div><div><dt>{t("settings.runtimeDirectory")}</dt><dd>{runtime.llamaRuntimeSettings.runtimeRoot || t("common.notDetected")}</dd></div><div><dt>{t("settings.modelDirectory")}</dt><dd>{runtime.ggufModelSettings.modelsRoot || t("common.notDetected")}</dd></div><div><dt>{t("settings.modelInventory")}</dt><dd>{runtime.ggufModelSettings.models.length} / {runtime.ggufModelSettings.files.length}</dd></div></dl></SettingCard>
    </SettingsSection>;
    if (category === "cache") return <>
      <SettingsSection title="stableSettings.section.cache"><SettingCard title="stableSettings.cacheOptimization" description="stableSettings.desc.cacheOptimization" query={normalizedQuery}><div className="cap-stable-settings-action-line"><span>{t("stableSettings.optimizationSummary", { queued: controller.thumbnailOptimizationStatus.queuedCount, processed: controller.thumbnailOptimizationStatus.processedCount, failed: controller.thumbnailOptimizationStatus.failedCount })}</span><SettingsToggle enabled={preferences.autoCacheOptimizationEnabled} onChange={(enabled) => toggle("autoCacheOptimizationEnabled", enabled)} /></div></SettingCard><SettingCard title="stableSettings.formalCache" description="stableSettings.desc.formalCache" query={normalizedQuery}><div className="cap-stable-settings-action-line"><span>{t("stableSettings.cacheSummary", { count: controller.visualCacheStats.cacheCount, size: formatCacheSize(controller.visualCacheStats.totalBytes) })}</span><button type="button" className="cap-stable-settings-button" onClick={() => openConfirmation(t("stableSettings.confirmClearCache"), controller.clearFormalCache)}>{t("settings.clearCache")}</button></div></SettingCard><SettingCard title="settings.skimCache" description="stableSettings.desc.skimCache" query={normalizedQuery}><div className="cap-stable-settings-action-line"><span>{t("stableSettings.cacheSummary", { count: controller.skimCacheStats.cacheCount, size: formatCacheSize(controller.skimCacheStats.totalBytes) })}</span><button type="button" className="cap-stable-settings-button" onClick={() => openConfirmation(t("stableSettings.confirmClearSkimCache"), controller.clearSkimCache)}>{t("settings.clearCache")}</button></div></SettingCard></SettingsSection>
      <SettingsSection title="stableSettings.section.index"><SettingCard title="settings.embeddedMetadata" description="stableSettings.desc.metadata" query={normalizedQuery}><EmbeddedMetadataSettingsRow stableUi /></SettingCard></SettingsSection>
    </>;
    if (category === "shortcuts") return <div className="cap-stable-settings-shortcut-groups"><SettingsSection title="stableSettings.section.keyboard"><SettingCard title="settings.quickActions" description="stableSettings.desc.quickActions" query={normalizedQuery} className="cap-stable-settings-card-with-body"><QuickActionSettingsRows quickActionGlobalEnabled={preferences.quickActionGlobalEnabled} shortcutActions={preferences.stableShortcutActions} unavailableShortcutActionIds={controller.unavailableShortcutActionIds} onGlobalEnabledChange={(enabled) => toggle("quickActionGlobalEnabled", enabled)} onShortcutActionsChange={controller.updateShortcutActions} onShortcutCaptureStart={controller.beginShortcutCapture} onShortcutCaptureEnd={controller.endShortcutCapture} /></SettingCard><SettingCard title="settings.quickCommands" description="stableSettings.desc.quickCommands" query={normalizedQuery} className="cap-stable-settings-card-with-command-body"><div className="cap-stable-settings-command-toggle"><SettingsToggle enabled={preferences.commandEnabled} onChange={(enabled) => toggle("commandEnabled", enabled)} /></div><QuickCommandSettingsRows stableUi /></SettingCard></SettingsSection></div>;
    if (category === "diagnostics") return <SettingsSection title="stableSettings.section.application"><SettingCard title="stableSettings.diagnostics" description="stableSettings.desc.diagnostics" query={normalizedQuery} className="cap-stable-settings-card-expanded"><RuntimeDiagnosticsRows stableUi /></SettingCard></SettingsSection>;
    return <><SettingsSection title="stableSettings.section.application"><SettingCard title="stableSettings.currentVersion" description="stableSettings.desc.version" query={normalizedQuery}><button type="button" className="cap-stable-settings-link" onClick={() => void window.cap7ce?.app.openReleasePage()}>0.9.9</button></SettingCard><SettingCard title="settings.versionUpdate" description="stableSettings.desc.update" query={normalizedQuery} className="cap-stable-settings-card-expanded"><SettingsWindowUpdateControl /></SettingCard><SettingCard title="stableSettings.license" description="stableSettings.desc.license" query={normalizedQuery}><span className="cap-stable-settings-readonly">{t("stableSettings.licenseValue")}</span></SettingCard></SettingsSection><SettingsFooter /></>;
  };

  return <div className={`cap-settings-window-foundation theme-${effectiveTheme}`} data-window-material={preferences.windowMaterial} data-language={getActiveLanguage()} style={menuStyle}>
    <div className="cap-settings-window-drag-region" aria-hidden="true" />
    <div className="cap-stable-settings-shell">
      <aside className="cap-stable-settings-navigation"><label className="cap-stable-settings-search"><StableUiIcon name="search" className="cap-stable-settings-search-icon" /><input value={query} type="search" placeholder={t("stableSettings.search")} aria-label={t("stableSettings.search")} onChange={(event) => { const value = event.target.value; setQuery(value); if (!searchCompositionRef.current) setFilterQuery(value); }} onCompositionStart={() => { searchCompositionRef.current = true; }} onCompositionEnd={(event) => { searchCompositionRef.current = false; const value = event.currentTarget.value; setQuery(value); setFilterQuery(value); }} /></label><nav aria-label={t("stableSettings.title")}>{visibleCategories.map((category) => <button key={category.id} type="button" className={activeCategory === category.id ? "is-active" : ""} aria-current={activeCategory === category.id ? "page" : undefined} onClick={() => { setActiveCategory(category.id); setQuery(""); setFilterQuery(""); scrollRef.current?.scrollTo({ top: 0 }); }}><SettingsCategoryIcon name={category.icon} /><span>{t(category.label)}</span></button>)}</nav></aside>
      <div className="cap-stable-settings-content-frame cap-scroll-viewport-frame cap-scroll-viewport-frame-vertical"><main className="cap-stable-settings-content cap-main-scroll-viewport" ref={scrollRef}><div className="cap-stable-settings-content-track">{shownCategories.length === 0 ? <p className="cap-stable-settings-empty">{t("stableSettings.noResults")}</p> : shownCategories.map((category) => <article key={category.id} className="cap-stable-settings-panel">{category.id === "browse" ? <header className="cap-stable-settings-page-heading"><h1>{t(category.label)}</h1><p>{t("stableSettings.desc.skimDisplay")}</p></header> : <h1>{t(category.label)}</h1>}{renderCategory(category.id)}</article>)}</div></main><CustomScrollbar scrollContainerRef={scrollRef} orientation="vertical" /></div>
    </div>
    {dialog && <SettingsConfirmationDialog message={dialog.message} busy={dialogBusy} confirmLabel={dialog.confirmLabel} onCancel={() => setDialog(null)} onConfirm={() => void confirmDialog()} />}
  </div>;
};

export default SettingsWindowApp;
