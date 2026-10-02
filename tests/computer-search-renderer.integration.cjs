const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const toolbar = read("src/renderer/stable-ui/StableSkimToolbar.tsx");
const slot = read("src/renderer/computer-search/ComputerSearchSkimSlot.tsx");
const controller = read("src/renderer/computer-search/useComputerSearchController.ts");
const view = read("src/renderer/computer-search/ComputerSearchView.tsx");
const actions = read("src/renderer/computer-search/useComputerSearchResultActions.ts");
const visual = read("src/renderer/computer-search/ComputerSearchResultVisual.tsx");

assert.match(toolbar, /aria-pressed=\{search\.active\}/u);
assert.match(toolbar, /search\.active \? search\.onExit\(\) : search\.onEnter\(\)/u);
assert.match(toolbar, /disabled=\{search\.active\}/u);
assert.match(slot, /cap-computer-search-browse\$\{controller\.active \? " is-hidden" : ""\}/u);
assert.match(slot, /\{content\}<\/div>[\s\S]*?controller\.active && <ComputerSearchView/u);
assert.match(controller, /window\.addEventListener\("keydown", handleKeyDown\)/u);
assert.match(controller, /event\.key !== "Escape"[\s\S]*?exit\(\)/u);
assert.match(controller, /cancelActive\(\)[\s\S]*?taskRef\.current !== taskId/u);
assert.match(controller, /setItems\(\(current\) => \[\.\.\.current, \.\.\.page\.items\]\)/u);
assert.match(controller, /useEffect\(\(\) => \(\) => \{ activeRef\.current = false; cancelActive\(\); \}/u);
assert.match(controller, /if \(statusRefreshInFlightRef\.current\) return;[\s\S]*?finally \{[\s\S]*?statusRefreshInFlightRef\.current = false/u);
assert.doesNotMatch(controller, /reason: "status-failed"/u,
  "one transient status timeout must not stop active catalog polling");
assert.match(slot, /controller\.error === "scope-offline"[\s\S]*?controller\.error === "scope-not-indexed"[\s\S]*?controller\.submittedQuery/u);
assert.match(controller, /taskId: taskRef\.current/u);
assert.match(controller, /capabilityOptions\(\)[\s\S]*?configureCapability\(\{ action, volumeLetters, removeCatalog: false \}\)/u);
assert.match(view, /status\?\.state === "not-enabled"[\s\S]*?configureCapability\("enable"\)/u);
assert.match(view, /status\?\.state === "repair-required"[\s\S]*?configureCapability\("repair"\)/u);
assert.doesNotMatch(controller, /if \(page\.isComplete\) taskRef\.current = null/u);
assert.match(view, /ComputerSearchResultVisual[\s\S]*?onDoubleClick[\s\S]*?onContextMenu[\s\S]*?onDragStart/u);
assert.match(actions, /computerSearch\.open\(authorization\(item\)\)/u);
assert.match(actions, /computerSearch\.inspect\(request\)[\s\S]*?sourceAuthorization/u);
assert.match(actions, /computerSearch\.copyPaths\(\{[\s\S]*?authorizationIds/u);
assert.match(visual, /IntersectionObserver[\s\S]*?computer-search-thumbnail/u);

console.log(JSON.stringify({
  computerSearchRenderer: "ok",
  selectedButtonToggles: true,
  escapeRestoresBrowse: true,
  browseRemainsMounted: true,
  latestRequestWins: true,
  transientStatusPollingRecovers: true,
  scopeErrorsOverrideZeroCount: true,
  authorizedResultActions: true,
  visibleOnlyVisuals: true,
  explicitCapabilityActivation: true
}));
