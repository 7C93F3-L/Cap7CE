const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createWorkspaceTabs, workspaceTabsReducer: reduce } = require("../src/renderer/workspace/workspaceTabs.ts");
const initial = () => ({
  search: { query: "", directoryId: "all", fileFormat: "all", sortField: "file_name", sortDirection: "asc", selectedExtensions: ["png"] },
  displayMode: "all", randomBrowse: { enabled: false, seed: 0, batchNumber: 0 },
  scroll: { layoutMode: "normal", offset: 0, progress: 0, anchorItemId: null, atEnd: false }, selectedIds: []
});
let state = createWorkspaceTabs(initial());
assert.equal(reduce(state, { type: "close", id: "all" }), state);
const source = initial();
state = reduce(state, { type: "open-directory", directoryId: "a", initial: source });
source.search.selectedExtensions.push("jpg");
assert.deepEqual(state.tabs[1].snapshot.search.selectedExtensions, ["png"]);
state = reduce(state, { type: "open-directory", directoryId: "b", initial: initial() });
state = reduce(state, { type: "open-directory", directoryId: "a", initial: initial() });
assert.equal(state.tabs.length, 3);
assert.equal(state.activeId, "directory:a");
assert.deepEqual(state.tabs.map((tab) => tab.id), ["all", "directory:a", "directory:b"]);
const snapshot = initial();
snapshot.search.query = "saved";
snapshot.search.directoryId = "b";
snapshot.scroll.offset = 180;
snapshot.randomBrowse = { enabled: true, seed: 42, batchNumber: 2 };
snapshot.selectedIds = ["file-1"];
state = reduce(state, { type: "snapshot", id: "directory:a", snapshot });
snapshot.search.query = "later mutation";
snapshot.selectedIds.push("file-2");
state = reduce(state, { type: "activate", id: "directory:b" });
state = reduce(state, { type: "activate", id: "directory:a" });
assert.equal(state.tabs[1].snapshot.search.query, "saved");
assert.equal(state.tabs[1].snapshot.search.directoryId, "a");
assert.equal(state.tabs[1].snapshot.scroll.offset, 180);
assert.equal(state.tabs[1].snapshot.randomBrowse.seed, 42);
assert.deepEqual(state.tabs[1].snapshot.selectedIds, ["file-1"]);
assert.equal(state.tabs[2].snapshot.search.query, "");
state = reduce(state, { type: "open-skim" });
state = reduce(state, { type: "open-skim" });
assert.equal(state.tabs.filter((tab) => tab.kind === "skim").length, 1);
assert.equal(reduce(state, { type: "snapshot", id: "skim", snapshot }), state);
state = reduce(state, { type: "close", id: "directory:a" });
assert.equal(state.activeId, "skim");
state = reduce(state, { type: "close", id: "skim" });
assert.equal(state.activeId, "directory:b");
state = reduce(state, { type: "close", id: "directory:b" });
assert.equal(state.activeId, "all");
assert.equal(reduce(state, { type: "activate", id: "missing" }), state);
assert.equal(reduce(state, { type: "snapshot", id: "directory:a", snapshot }), state, "closed tabs reject late snapshots");
state = reduce(state, { type: "open-directory", directoryId: "a", initial: initial() });
assert.equal(state.tabs[1].snapshot.search.query, "", "reopening starts a fresh context");
for (const file of ["workspaceTabs.ts", "useWorkspaceTabs.ts"]) {
  const text = fs.readFileSync(`${__dirname}/../src/renderer/workspace/${file}`, "utf8");
  assert.doesNotMatch(text, /window\.|localStorage|cap7ce|electron\/|from ["'].*App["']/, "workspace state must remain free of business IO and persistence");
}
console.log("Workspace tab identity, snapshot isolation, close fallback and ownership checks passed.");
