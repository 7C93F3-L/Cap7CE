const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const paths = {
  controller: "electron/core/coreHostController.ts",
  launch: "electron/core/coreHostLaunchProfile.ts",
  client: "electron/core/coreProtocolClient.ts",
  controllerTest: "tests/core-host-controller.integration.cjs"
};
for (const relativePath of Object.values(paths)) {
  if (!fs.existsSync(path.join(root, relativePath))) failures.push(`Missing Core Electron boundary: ${relativePath}.`);
}
if (failures.length === 0) {
  const controller = read(paths.controller);
  const launch = read(paths.launch);
  const client = read(paths.client);
  const controllerTest = read(paths.controllerTest);
  const diagnostic = read("electron/core/coreCatalogDiagnostics.ts");
  if (/node:|setInterval|setTimeout|ipcMain|ipcRenderer|writeFile|appendFile/.test(diagnostic) || diagnostic.split(/\r?\n/).length > 85)
    failures.push("Core diagnostic consumer must remain bounded and free of polling, IPC and file access.");
  for (const anchor of ["4096", "catalog-diagnostic-v1", "Number.isFinite", "categories[key]"])
    if (!diagnostic.includes(anchor)) failures.push(`Core diagnostic consumer is missing ${anchor}.`);
  const controllerBoundary = `${controller}\n${launch}\n${client}\n${diagnostic}`;
  for (const [source, anchor, description] of [
    [controller, "packaged-core-not-installed", "probe packaged fallback"],
    [launch, "--catalog-controller-probe", "temporary probe activation"],
    [launch, "--catalog-server", "product catalog activation"],
    [controller, "core.shutdown", "graceful shutdown"],
    [controller, "this.restartCount >= 1", "single restart ceiling"],
    [client, "expectedServerProcessId", "server PID verification"],
    [controllerTest, "core-crash-restart-exhausted", "restart coverage"]
  ]) if (!source.includes(anchor)) failures.push(`Core Electron boundary is missing ${description}.`);

  for (const [pattern, description] of [
    [/from ["']electron["']|require\(["']electron["']\)/, "Electron API dependency"],
    [/ipcMain|ipcRenderer|contextBridge/, "Renderer IPC exposure"],
    [/Reader\.Host|Cap7CE\.Core\.Reader\.Host/, "direct Reader launch"]
  ]) if (pattern.test(controllerBoundary)) failures.push(`Core controller introduces ${description}.`);
}

if (failures.length) {
  console.error("Core Electron controller architecture checks failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else console.log(JSON.stringify({
  status: "passed", directReaderLaunch: false, automaticRestartLimit: 1
}));
