const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const packageJson = JSON.parse(read("package.json"));
const architecture = read("docs/SOFTWARE_ARCHITECTURE.md");
const coreReadme = read("core/README.md");
const notices = read("THIRD_PARTY_NOTICES.md");
const main = read("electron/main.ts");
const controller = read("electron/computerSearchRuntime.ts");
const capabilityBuilder = read("build/core-capability-dev.electron-builder.cjs");
const productInstallerSmoke = read("scripts/core-product-installer-smoke.cjs");
const capability = read("electron/computerSearchCapability.ts");
const runtimeInstaller = read("electron/computerSearchRuntimeInstaller.ts");
const setupProfile = read("core/src/Cap7CE.Core.Setup/CapabilitySetupProductWindowsProfile.cs");
const hostProfile = read("core/src/Cap7CE.Core.Host/ReaderClientConstants.cs");
const readerProfile = read("core/src/Cap7CE.Core.Reader.Host/ReaderHostConstants.cs");
const buildProfile = read("scripts/core-capability-build-profile.cjs");
const capabilityManifest = JSON.parse(read("core/deployment/capability-setup-manifest.v1.json"));

const failures = [];
const requireText = (source, text, description) => {
  if (!source.includes(text)) failures.push(`Missing ${description}.`);
};

requireText(architecture, "P3.8a 正式化审计", "public P3.8 architecture status");
requireText(coreReadme, "P3.7–P3.8 恢复与正式化审计", "Core recovery and formalization section");
requireText(notices, "Microsoft.Data.Sqlite / Microsoft.Data.Sqlite.Core 10.0.12", "Microsoft.Data.Sqlite notice");
requireText(notices, "SQLitePCLRaw 2.1.12 packages", "SQLitePCLRaw notice");
requireText(notices, "resources/licenses/core-dependencies", "packaged Core dependency license location");
requireText(main, "registerComputerSearchIpc", "product computer-search IPC registration");
requireText(controller, "launchMode: \"product\"", "product Core launch profile");
requireText(capabilityBuilder, 'from: "core/artifacts/capability/v1/bundle"', "isolated capability payload");
requireText(setupProfile, '"Cap7CE NTFS Reader"', "production Setup service identity");
requireText(hostProfile, '"Cap7CENtfsReader"', "production Core service identity");
requireText(readerProfile, '"cap7ce-ntfs-reader-v1"', "production Reader pipe identity");
requireText(buildProfile, '"-p:P38ProductProfile=true"', "separate product capability compilation");
requireText(capability, capabilityManifest.runtime.installerUrl, "fixed Microsoft runtime URL");
requireText(capability, capabilityManifest.runtime.installerSha512, "fixed Microsoft runtime digest");
requireText(runtimeInstaller, '["/install", "/norestart"]', "foreground runtime install arguments");
requireText(runtimeInstaller, 'createHash("sha512")', "runtime installer digest verification");
requireText(productInstallerSmoke, "systemChangesPerformed: false", "read-only regular installer smoke test");
requireText(packageJson.scripts["dist:installer"], "core-product-installer-smoke.cjs",
  "regular installer package inspection");

for (const stale of ["unshipped Core development tree", "currently unshipped .NET Core catalog"]) {
  if (notices.includes(stale)) failures.push(`Third-party notices retain stale wording: ${stale}.`);
}

const regularResources = packageJson.build?.extraResources ?? [];
const capabilityResources = regularResources.filter((entry) => entry?.to === "core-capability/v1");
if (capabilityResources.length !== 1
    || capabilityResources[0].from !== "core/artifacts/product-capability/v1/bundle") {
  failures.push("The regular package must include exactly one deterministic Core capability bundle.");
}
const coreLicenseResources = regularResources.filter((entry) => entry?.to === "licenses/core-dependencies");
if (coreLicenseResources.length !== 1
    || coreLicenseResources[0].from !== "third_party/core-dependencies") {
  failures.push("The regular package must include the Core dependency license texts.");
}
if (/shutdown|restart-computer|Restart-Computer/i.test(runtimeInstaller)) {
  failures.push("The runtime installer must never restart Windows automatically.");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  decision: "proceed-to-formal-product-lifecycle",
  productSurface: "skim-computer-search",
  regularPackageConnected: true,
  baseSearchConvergenceAuthorized: false
}));
