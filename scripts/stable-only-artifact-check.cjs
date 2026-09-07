const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outputDirectories = ["dist", "dist-electron"];
const textFilePattern = /(?:\.d\.ts|\.js|\.css|\.html)$/u;
const forbiddenIdentifiers = [
  "WindowPresentationRuntime",
  "WindowPresentationSwitchRuntime",
  "windowPresentationPolicy",
  "windowPresentationMode",
  "capsuleWindowController",
  "stableUiDevelopmentContract",
  "CompatibilityTitlebar",
  "CompatibilityCapsuleWindowApp",
  "QuickSearchCapsule",
  "Cap7CESearchCapsule",
  "LegacyResultsContextMenuLayer",
  "LegacySkimContextMenuLayer",
  "activateMicro",
  "activateMini",
  "appUpdateCompletion",
  "appUpdateLauncher",
  "update-helper.ps1",
  "helper-ready",
  "helper-failed"
];

const collectFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
});

const failures = [];
for (const relativeDirectory of outputDirectories) {
  const outputDirectory = path.join(projectRoot, relativeDirectory);
  if (!fs.existsSync(outputDirectory)) {
    failures.push(`${relativeDirectory}: build output is missing`);
    continue;
  }

  for (const filePath of collectFiles(outputDirectory).filter((candidate) => textFilePattern.test(candidate))) {
    const content = fs.readFileSync(filePath, "utf8");
    for (const identifier of forbiddenIdentifiers) {
      if (filePath.includes(identifier) || content.includes(identifier)) {
        failures.push(`${path.relative(projectRoot, filePath)}: contains ${identifier}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`Stable-only artifact audit failed:\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Stable-only artifact audit passed.");
}
