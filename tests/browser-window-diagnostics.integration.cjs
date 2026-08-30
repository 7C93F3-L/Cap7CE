const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createBrowserWindowWithDiagnostics } = require("../dist-electron/browserWindowDiagnostics.js");

const mainSource = fs.readFileSync(path.join(__dirname, "../electron/main.ts"), "utf8");

const entries = [];
const diagnostics = { log: (level, event, data) => entries.push({ level, event, data }) };
const createdWindow = { id: "main-window" };
const created = createBrowserWindowWithDiagnostics({
  create: (options) => ({ ...createdWindow, options }),
  diagnostics,
  options: { width: 300, height: 156 },
  presentationMode: "compatibility",
  surface: "main"
});

assert.equal(created.id, "main-window");
assert.deepEqual(entries, []);

const creationError = new Error("native window creation failed");
assert.throws(() => createBrowserWindowWithDiagnostics({
  create: () => { throw creationError; },
  diagnostics,
  options: { width: 500, height: 400 },
  presentationMode: "compatibility",
  surface: "preview"
}), creationError);
assert.deepEqual(entries, [{
  level: "error",
  event: "window.creation.failed",
  data: { surface: "preview", presentationMode: "compatibility", error: creationError }
}]);
const diagnosticFailureCreationError = new Error("window failure remains authoritative");
assert.throws(() => createBrowserWindowWithDiagnostics({
  create: () => { throw diagnosticFailureCreationError; },
  diagnostics: { log: () => { throw new Error("diagnostic write failed"); } },
  options: {},
  presentationMode: "cap7ce",
  surface: "line"
}), diagnosticFailureCreationError);
for (const surface of ["main", "preview", "line", "capsule", "startup-hint"]) {
  assert.ok(mainSource.includes(`createApplicationWindow("${surface}"`), `Missing diagnosed window surface: ${surface}`);
}
assert.match(mainSource, /runtimeDiagnostics\.log\("info", "window\.presentation\.startup", \{ requestedMode: normalizedRequestedWindowPresentationMode, activeMode: windowPresentationRuntime\.mode, source:/u);

console.log(JSON.stringify({
  successfulCreationRemainsSilent: true,
  creationFailureRecordedAndRethrown: true,
  diagnosticFailureDoesNotMaskCreationError: true,
  diagnosticContainsOnlySurfaceModeAndError: true,
  allApplicationWindowSurfacesCovered: true,
  startupModeRecorded: true
}));
