const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const paths = {
  controller: "electron/core/coreHostController.ts",
  launch: "electron/core/coreHostLaunchProfile.ts",
  client: "electron/core/coreProtocolClient.ts",
  types: "electron/core/coreProtocolTypes.ts",
  productTypes: "electron/core/coreProductProtocolTypes.ts",
  capability: "electron/computerSearchCapability.ts",
  runtime: "electron/computerSearchRuntime.ts",
  ipc: "electron/computerSearchIpc.ts",
  publicTypes: "electron/computerSearchTypes.ts",
  developmentBuild: "scripts/core-development-host-build.cjs",
  controllerTest: "tests/core-host-controller.integration.cjs",
  ipcTest: "tests/computer-search-ipc.integration.cjs"
};

for (const relativePath of Object.values(paths)) {
  if (!fs.existsSync(path.join(root, relativePath))) failures.push(`Missing Core Electron boundary: ${relativePath}.`);
}

if (failures.length === 0) {
  const controller = read(paths.controller);
  const launch = read(paths.launch);
  const client = read(paths.client);
  const runtime = read(paths.runtime);
  const developmentBuild = read(paths.developmentBuild);
  const capability = read(paths.capability);
  const ipc = read(paths.ipc);
  const controllerTest = read(paths.controllerTest);
  const controllerBoundary = `${controller}\n${launch}\n${client}`;
  for (const [source, anchor, description] of [
    [controller, "packaged-core-not-installed", "probe packaged fallback"],
    [launch, "--catalog-controller-probe", "temporary probe activation"],
    [launch, "--catalog-server", "product catalog activation"],
    [controller, "core.shutdown", "graceful shutdown"],
    [controller, "this.restartCount >= 1", "single restart ceiling"],
    [client, "expectedServerProcessId", "server PID verification"],
    [runtime, "catalog.resolveScope", "stable path-to-scope resolution"],
    [runtime, "randomBytes(24)", "opaque result authorization"],
    [runtime, "resolveAuthorizedItem", "session result authorization lookup"],
    [runtime, "resolved.rootFileReference", "directory-or-volume scope distinction"],
    [runtime, ': { kind: "all-volumes" }', "drive-root volume scope selection"],
    [runtime, "Cap7CE.Core.Host.exe", "fixed installed host path"],
    [runtime, "core/artifacts/development-product-host/Cap7CE.Core.Host.exe", "isolated development product host path"],
    [developmentBuild, 'selectCapabilityBuildProfile(["--product"])', "product-profile development host build"],
    [developmentBuild, 'path.join(artifactsRoot, "development-product-host")', "isolated development host output"],
    [capability, "Cap7CE.Core.Setup.exe", "fixed packaged Setup path"],
    [capability, "--activation-coordinator", "authenticated capability coordinator"],
    [ipc, "computerSearch:search", "separate product search IPC"],
    [ipc, "computerSearch:configureCapability", "product capability lifecycle IPC"],
    [ipc, "computerSearch:open", "authorized result invocation IPC"],
    [ipc, "computerSearch:startDrag", "authorized native drag IPC"],
    [controllerTest, "core-crash-restart-exhausted", "restart coverage"]
  ]) if (!source.includes(anchor)) failures.push(`Core Electron boundary is missing ${description}.`);

  const packageJson = JSON.parse(read("package.json"));
  if (packageJson.scripts?.["publish:core-development-host"] !== "node scripts/core-development-host-build.cjs") {
    failures.push("Core development host must have one fixed product-profile build command.");
  }
  if (!packageJson.scripts?.["dev:electron"]?.includes("npm run publish:core-development-host")) {
    failures.push("Electron development startup must prepare the isolated product-profile Core Host.");
  }

  for (const [pattern, description] of [
    [/from ["']electron["']|require\(["']electron["']\)/, "Electron API dependency"],
    [/ipcMain|ipcRenderer|contextBridge/, "Renderer IPC exposure"],
    [/Reader\.Host|Cap7CE\.Core\.Reader\.Host/, "direct Reader launch"]
  ]) if (pattern.test(controllerBoundary)) failures.push(`Core controller introduces ${description}.`);
  if (/search:images|sql\.js/i.test(`${runtime}\n${ipc}`)) failures.push("Computer search must not reuse formal search IPC or sql.js.");
  const main = read("electron/main.ts");
  const preload = read("electron/preload.ts");
  const app = read("src/renderer/App.tsx");
  if (!main.includes("registerComputerSearchIpc") || !main.includes("createComputerSearchRuntime")) {
    failures.push("main.ts must assemble the P3.5 domain registration only.");
  }
  if (!preload.includes("computerSearch:status") || !preload.includes("computerSearch:cancel")) {
    failures.push("preload.ts must expose the isolated P3.5 bridge.");
  }
  if (/coreHostController|CoreHostController|Cap7CE\.Core/i.test(`${main}\n${preload}\n${app}`)) {
    failures.push("App, preload, and main must not directly own the Core controller.");
  }
}

if (failures.length) {
  console.error("Core Electron controller architecture checks failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else console.log(JSON.stringify({
  status: "passed", activation: "skim-search-demand", rendererIpc: true,
  packagedCore: true, isolatedDevelopmentProductHost: true,
  directReaderLaunch: false, automaticRestartLimit: 1
}));
