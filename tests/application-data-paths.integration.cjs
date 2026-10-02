const assert = require("node:assert/strict");
const path = require("node:path");

const { resolveApplicationDataPaths } = require("../dist-electron/applicationDataPaths.js");

const localRoot = path.resolve("C:\\Users\\Test User\\AppData\\Local");
const fallbackRoot = path.resolve("C:\\Users\\Test User\\AppData\\Roaming");

const localPaths = resolveApplicationDataPaths({
  applicationName: "Cap7CE",
  localAppDataPath: `  ${localRoot}  `,
  fallbackAppDataPath: fallbackRoot
});
assert.equal(localPaths.productRoot, path.join(localRoot, "Cap7CE"));
assert.equal(localPaths.userDataRoot, path.join(localRoot, "Cap7CE", "UserData"));

const fallbackPaths = resolveApplicationDataPaths({
  applicationName: "Cap7CE",
  localAppDataPath: "  ",
  fallbackAppDataPath: fallbackRoot
});
assert.equal(fallbackPaths.productRoot, path.join(fallbackRoot, "Cap7CE"));
assert.equal(fallbackPaths.userDataRoot, path.join(fallbackRoot, "Cap7CE", "UserData"));

console.log("application data paths integration test passed");
