const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const controllerPath = "electron/core/coreHostController.ts";
const clientPath = "electron/core/coreProtocolClient.ts";
const typesPath = "electron/core/coreProtocolTypes.ts";
const testPath = "tests/core-host-controller.integration.cjs";

for (const relativePath of [controllerPath, clientPath, typesPath, testPath]) {
  if (!fs.existsSync(path.join(root, relativePath))) failures.push(`Missing P3.2 Core controller boundary: ${relativePath}.`);
}

if (failures.length === 0) {
  const controller = read(controllerPath);
  const client = read(clientPath);
  const test = read(testPath);
  for (const [source, anchor, description] of [
    [controller, "packaged-core-not-installed", "packaged-not-installed fallback"],
    [controller, "--catalog-controller-probe", "explicit temporary probe activation"],
    [controller, "core.shutdown", "graceful Core shutdown"],
    [controller, "this.restartCount >= 1", "single automatic restart ceiling"],
    [controller, "child.kill()", "owned-process timeout termination"],
    [client, "\\\\\\\\.\\\\pipe\\\\", "local named-pipe transport"],
    [client, "writeUInt32LE", "SC/1 length-prefixed framing"],
    [client, "expectedServerProcessId", "server PID verification"],
    [test, "deadline-exceeded", "deadline coverage"],
    [test, "core-crash-restart-exhausted", "crash restart coverage"]
  ]) {
    if (!source.includes(anchor)) failures.push(`P3.2 Core controller is missing ${description}.`);
  }

  const combined = `${controller}\n${client}`;
  for (const [pattern, description] of [
    [/from ["']electron["']|require\(["']electron["']\)/, "Electron API dependency"],
    [/ipcMain|ipcRenderer|contextBridge/, "Renderer IPC exposure"],
    [/search:images|\bSkim\b|sql\.js|electron-builder|nsis/i, "later-round integration"],
    [/Reader\.Host|Cap7CE\.Core\.Reader\.Host/, "direct Reader launch"]
  ]) {
    if (pattern.test(combined)) failures.push(`P3.2 Core controller introduces ${description}.`);
  }
}

for (const integrationPath of ["electron/main.ts", "electron/preload.ts", "src/renderer/App.tsx"]) {
  const source = read(integrationPath);
  if (/coreHostController|CoreHostController|Cap7CE\.Core/i.test(source)) {
    failures.push(`${integrationPath} activates Core before P3.3.`);
  }
}

const packageJson = JSON.parse(read("package.json"));
if (packageJson.build.files.some((entry) => typeof entry === "string" && entry.replaceAll("\\", "/").startsWith("core/"))) {
  failures.push("P3.2 must not package Core.");
}
if (packageJson.build.extraResources.some((entry) => typeof entry?.from === "string"
    && entry.from.replaceAll("\\", "/").startsWith("core/"))) {
  failures.push("P3.2 must not add Core to Electron Builder extraResources.");
}

if (failures.length > 0) {
  console.error("Core Electron controller architecture checks failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: "passed",
    activation: "test-diagnostic-only",
    rendererIpc: false,
    packagedCore: false,
    directReaderLaunch: false,
    automaticRestartLimit: 1
  }));
}
