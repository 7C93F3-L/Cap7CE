const assert = require("node:assert/strict");
const { registerPreferenceIpc } = require("../dist-electron/preferenceIpc.js");

const run = async () => {
  const handles = new Map();
  const calls = [];
  const response = { updatedAt: "test" };
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
    updateSkimSystemLocationsCollapsed: capture("skimSystemLocationsCollapsed")
  });

  assert.deepEqual([...handles.keys()], [
    "preferences:get",
    "preferences:updateSkimSort",
    "preferences:updateOperationHints",
    "preferences:updateCommandEnabled",
    "preferences:updateSearchLabelVisibility",
    "preferences:updateSkimDisplay",
    "preferences:updateSkimSidebarFolders",
    "preferences:updateSkimSystemLocationsCollapsed"
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
    recognition: 0,
    sort: "yes",
    format: null,
    skimDisplay: true
  });
  await handles.get("preferences:updateSkimDisplay")(event, skimDisplay);
  await handles.get("preferences:updateSkimSidebarFolders")(event, sidebarFolders);
  await handles.get("preferences:updateSkimSystemLocationsCollapsed")(event, "collapsed");

  assert.deepEqual(calls, [
    ["skimSort", skimSort],
    ["operationHints", true],
    ["commandEnabled", false],
    ["searchLabelVisibility", {
      directory: true,
      recognition: false,
      sort: true,
      format: false,
      skimDisplay: true
    }],
    ["skimDisplay", skimDisplay],
    ["skimSidebarFolders", sidebarFolders],
    ["skimSystemLocationsCollapsed", "collapsed"]
  ]);

  console.log("Preference IPC integration tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
