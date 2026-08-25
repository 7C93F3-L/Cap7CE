const assert = require("node:assert/strict");
const { registerPreferenceIpc } = require("../dist-electron/preferenceIpc.js");

const run = async () => {
  const handles = new Map();
  const calls = [];
  const response = {
    updatedAt: "test",
    sortPreference: { sortField: "modified_at", sortDirection: "desc" },
    launchAtLogin: true,
    systemNotificationsEnabled: false,
    autoCacheOptimizationEnabled: true,
    aiRecognitionEnabled: true
  };
  const capture = (name) => async (value) => {
    calls.push([name, value]);
    return response;
  };

  registerPreferenceIpc({
    registrar: {
      handle: (channel, listener) => handles.set(channel, listener),
      on: () => undefined
    },
    getPreferences: async () => response,
    updateSkimSort: capture("skimSort"),
    updateOperationHints: capture("operationHints"),
    updateCommandEnabled: capture("commandEnabled"),
    updateSearchLabelVisibility: capture("searchLabelVisibility"),
    updateSkimDisplay: capture("skimDisplay"),
    updateSkimSidebarFolders: capture("skimSidebarFolders"),
    updateSkimSystemLocationsCollapsed: capture("skimSystemLocationsCollapsed"),
    updateTheme: capture("theme"),
    refreshAppearance: () => calls.push(["refreshAppearance"]),
    applyLanguage: capture("language"),
    updateSort: capture("sort"),
    applyThumbnailSort: (sortPreference) => calls.push(["applyThumbnailSort", sortPreference]),
    updateAppearanceColors: capture("appearanceColors"),
    setEdgeCollapseEnabled: capture("edgeCollapse"),
    setRememberWindowLayout: capture("rememberWindowLayout"),
    setStandbyLineVisible: capture("standbyLineVisible"),
    updateLaunchAtLogin: capture("launchAtLogin"),
    applyLaunchAtLogin: (enabled) => calls.push(["applyLaunchAtLogin", enabled]),
    updateSystemNotifications: capture("systemNotifications"),
    applySystemNotifications: (enabled) => calls.push(["applySystemNotifications", enabled]),
    updateAutoCacheOptimization: capture("autoCacheOptimization"),
    updateAiRecognitionEnabled: capture("aiRecognitionEnabled"),
    setAutoCacheOptimizationEnabled: async (enabled) => calls.push(["setAutoCacheOptimizationEnabled", enabled]),
    scheduleAutoCacheOptimization: async () => calls.push(["scheduleAutoCacheOptimization"])
  });

  assert.deepEqual([...handles.keys()], [
    "preferences:get",
    "preferences:updateSkimSort",
    "preferences:updateOperationHints",
    "preferences:updateCommandEnabled",
    "preferences:updateSearchLabelVisibility",
    "preferences:updateSkimDisplay",
    "preferences:updateSkimSidebarFolders",
    "preferences:updateSkimSystemLocationsCollapsed",
    "preferences:updateTheme",
    "preferences:updateLanguage",
    "preferences:updateSort",
    "preferences:updateAppearanceColors",
    "preferences:updateEdgeCollapse",
    "preferences:updateRememberWindowLayout",
    "preferences:updateStandbyLineVisible",
    "preferences:updateLaunchAtLogin",
    "preferences:updateSystemNotifications",
    "preferences:updateAiRecognitionEnabled",
    "preferences:updateAutoCacheOptimization"
  ]);

  const event = { sender: { id: 1 } };
  assert.equal(await handles.get("preferences:get")(event), response);

  const skimSort = { sortField: "modified_at", sortDirection: "desc" };
  const skimDisplay = {
    mode: "custom",
    searchMode: "all",
    customExtensions: [".png", ".pdf"],
    showHiddenFiles: true
  };
  const sidebarFolders = ["C:\\Work", "D:\\Assets"];
  await handles.get("preferences:updateSkimSort")(event, skimSort);
  await handles.get("preferences:updateOperationHints")(event, 1);
  await handles.get("preferences:updateCommandEnabled")(event, 0);
  await handles.get("preferences:updateSearchLabelVisibility")(event, {
    directory: 1,
    sort: "yes",
    format: null,
    skimDisplay: true,
    ai: true
  });
  await handles.get("preferences:updateSkimDisplay")(event, skimDisplay);
  await handles.get("preferences:updateSkimSidebarFolders")(event, sidebarFolders);
  await handles.get("preferences:updateSkimSystemLocationsCollapsed")(event, "collapsed");
  await handles.get("preferences:updateTheme")(event, "dark");
  await handles.get("preferences:updateLanguage")(event, "invalid");
  await handles.get("preferences:updateSort")(event, { sortField: "file_name", sortDirection: "asc" });
  await handles.get("preferences:updateAppearanceColors")(event, { themeColor: "#111111", accentColor: "#222222" });
  await handles.get("preferences:updateEdgeCollapse")(event, 1);
  await handles.get("preferences:updateRememberWindowLayout")(event, 1);
  await handles.get("preferences:updateStandbyLineVisible")(event, 1);
  await handles.get("preferences:updateLaunchAtLogin")(event, "enabled");
  await handles.get("preferences:updateSystemNotifications")(event, 0);
  await handles.get("preferences:updateAiRecognitionEnabled")(event, 0);
  await handles.get("preferences:updateAutoCacheOptimization")(event, 0);

  assert.deepEqual(calls, [
    ["skimSort", skimSort],
    ["operationHints", true],
    ["commandEnabled", false],
    ["searchLabelVisibility", {
      directory: true,
      sort: true,
      format: false,
      skimDisplay: true,
      ai: true
    }],
    ["skimDisplay", skimDisplay],
    ["skimSidebarFolders", sidebarFolders],
    ["skimSystemLocationsCollapsed", "collapsed"],
    ["theme", "dark"],
    ["refreshAppearance"],
    ["language", "system"],
    ["sort", { sortField: "file_name", sortDirection: "asc" }],
    ["applyThumbnailSort", response.sortPreference],
    ["appearanceColors", { themeColor: "#111111", accentColor: "#222222" }],
    ["refreshAppearance"],
    ["edgeCollapse", true],
    ["rememberWindowLayout", true],
    ["standbyLineVisible", true],
    ["launchAtLogin", true],
    ["applyLaunchAtLogin", response.launchAtLogin],
    ["systemNotifications", false],
    ["applySystemNotifications", response.systemNotificationsEnabled],
    ["aiRecognitionEnabled", false],
    ["autoCacheOptimization", false],
    ["setAutoCacheOptimizationEnabled", response.autoCacheOptimizationEnabled],
    ["scheduleAutoCacheOptimization"]
  ]);

  const disabledResponse = { ...response, autoCacheOptimizationEnabled: false };
  const disabledCalls = [];
  const disabledHandles = new Map();
  registerPreferenceIpc({
    registrar: {
      handle: (channel, listener) => disabledHandles.set(channel, listener),
      on: () => undefined
    },
    getPreferences: async () => disabledResponse,
    updateSkimSort: async () => disabledResponse,
    updateOperationHints: async () => disabledResponse,
    updateCommandEnabled: async () => disabledResponse,
    updateSearchLabelVisibility: async () => disabledResponse,
    updateSkimDisplay: async () => disabledResponse,
    updateSkimSidebarFolders: async () => disabledResponse,
    updateSkimSystemLocationsCollapsed: async () => disabledResponse,
    updateTheme: async () => disabledResponse,
    refreshAppearance: () => undefined,
    applyLanguage: async () => disabledResponse,
    updateSort: async () => disabledResponse,
    applyThumbnailSort: () => undefined,
    updateAppearanceColors: async () => disabledResponse,
    setEdgeCollapseEnabled: async () => disabledResponse,
    setRememberWindowLayout: async () => disabledResponse,
    setStandbyLineVisible: async () => disabledResponse,
    updateLaunchAtLogin: async () => disabledResponse,
    applyLaunchAtLogin: () => undefined,
    updateSystemNotifications: async () => disabledResponse,
    applySystemNotifications: () => undefined,
    updateAutoCacheOptimization: async () => disabledResponse,
    updateAiRecognitionEnabled: async () => disabledResponse,
    setAutoCacheOptimizationEnabled: async (enabled) => disabledCalls.push(["set", enabled]),
    scheduleAutoCacheOptimization: async () => disabledCalls.push(["schedule"])
  });
  await disabledHandles.get("preferences:updateAutoCacheOptimization")(event, true);
  assert.deepEqual(disabledCalls, [["set", false]]);

  console.log("Preference IPC integration tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
