const fs = require("node:fs");
const path = require("node:path");
const { builtinModules } = require("node:module");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, "architecture-boundaries-baseline.json"), "utf8"));
const failures = [];

const readProjectFile = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const physicalLineCount = (text) => text.split(/\r?\n/).length;

const migrationBaseline = baseline.stableUiMigration;
const requiredSurfaceIds = new Set(migrationBaseline.requiredSurfaceIds);
const migrationSurfaceIds = new Set(migrationBaseline.surfaces.map((surface) => surface.id));

if (migrationSurfaceIds.size !== migrationBaseline.surfaces.length) {
  failures.push("Stable UI migration surface IDs must remain unique.");
}

for (const requiredSurfaceId of requiredSurfaceIds) {
  if (!migrationSurfaceIds.has(requiredSurfaceId)) {
    failures.push(`Stable UI migration surface "${requiredSurfaceId}" is missing from the U0 baseline.`);
  }
}

for (const surface of migrationBaseline.surfaces) {
  if (!requiredSurfaceIds.has(surface.id)) {
    failures.push(`Stable UI migration surface "${surface.id}" is not part of the frozen U0 scope.`);
  }
  for (const anchor of surface.sourceAnchors) {
    const absolutePath = path.join(root, anchor.path);
    if (!fs.existsSync(absolutePath)) {
      failures.push(`Stable UI migration source "${anchor.path}" for "${surface.id}" no longer exists.`);
      continue;
    }
    if (!fs.readFileSync(absolutePath, "utf8").includes(anchor.contains)) {
      failures.push(`Stable UI migration anchor "${anchor.contains}" for "${surface.id}" is missing from ${anchor.path}. Update the migration map when ownership moves.`);
    }
  }
}

const localPrototypeIgnore = "prototypes/stable-ui-canvas/";
const gitIgnoreEntries = readProjectFile(".gitignore").split(/\r?\n/).map((entry) => entry.trim());
if (!gitIgnoreEntries.includes(localPrototypeIgnore)) {
  failures.push(`Local stable UI prototype must remain ignored by Git via "${localPrototypeIgnore}".`);
}
if (fs.existsSync(path.join(root, ".git"))) {
  const trackedPrototypeFiles = execFileSync("git", ["ls-files", "--", localPrototypeIgnore], {
    cwd: root,
    encoding: "utf8"
  }).trim();
  if (trackedPrototypeFiles) {
    failures.push("Local stable UI prototype files must not be tracked by Git.");
  }
}

const strictMaxLines = baseline.strictMaxLines ?? {};
const maintenanceMaxLines = baseline.maintenanceMaxLines ?? {};
const duplicateLineLimitPaths = Object.keys(strictMaxLines).filter((relativePath) => Object.hasOwn(maintenanceMaxLines, relativePath));

if (Object.hasOwn(baseline, "maxLines")) {
  failures.push("Legacy maxLines configuration is not supported. Classify every target as strictMaxLines or maintenanceMaxLines.");
}
if (Object.keys(strictMaxLines).length === 0 || Object.keys(maintenanceMaxLines).length === 0) {
  failures.push("Architecture line limits must retain both strict and maintenance ownership classes.");
}

for (const relativePath of duplicateLineLimitPaths) {
  failures.push(`${relativePath} has both a strict and maintenance line limit. Keep exactly one ownership class.`);
}

const verifyLineLimit = (relativePath, maximum, kind) => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${kind} line-limit target ${relativePath} no longer exists. Remove or move its architecture boundary explicitly.`);
    return;
  }
  if (!Number.isInteger(maximum) || maximum <= 0) {
    failures.push(`${kind} line-limit target ${relativePath} has invalid maximum ${maximum}.`);
    return;
  }
  const actual = physicalLineCount(fs.readFileSync(absolutePath, "utf8"));
  if (actual > maximum) {
    const guidance = kind === "Strict"
      ? "Move the responsibility to its domain module or explicitly revise the architecture plan and lower the boundary again after extraction."
      : "Review whether the responsibility still belongs here before explicitly advancing this fixed maintenance threshold.";
    failures.push(`${relativePath} grew to ${actual} lines (maximum ${maximum}, ${kind.toLowerCase()} limit). ${guidance}`);
  }
};

for (const [relativePath, maximum] of Object.entries(maintenanceMaxLines)) {
  const step = maximum <= 50 ? 10 : maximum <= 200 ? 25 : null;
  if (step === null || maximum % step !== 0) {
    failures.push(`Maintenance line limit for ${relativePath} must be a fixed 10-line threshold up to 50 or a fixed 25-line threshold up to 200; received ${maximum}.`);
    continue;
  }
  verifyLineLimit(relativePath, maximum, "Maintenance");
}

for (const [relativePath, maximum] of Object.entries(strictMaxLines)) {
  verifyLineLimit(relativePath, maximum, "Strict");
}

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});

const rendererRoot = path.join(root, "src", "renderer");
const rendererFiles = walkFiles(rendererRoot).filter((filePath) => /\.(?:ts|tsx)$/.test(filePath));
const importPattern = /(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g;
const builtinModuleNames = new Set(builtinModules.flatMap((name) => [name, name.replace(/^node:/, "")]));

for (const filePath of rendererFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  const relativePath = path.relative(root, filePath).replaceAll("\\", "/");
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    const rootSpecifier = specifier.replace(/^node:/, "").split("/")[0];
    if (specifier === "electron" || specifier.startsWith("node:") || builtinModuleNames.has(specifier) || builtinModuleNames.has(rootSpecifier)) {
      failures.push(`${relativePath} imports privileged runtime module "${specifier}". Renderer access must continue through preload and shared contracts.`);
    }
    if (relativePath !== "src/renderer/main.tsx" && /(?:^|\/)App$/.test(specifier)) {
      failures.push(`${relativePath} imports App.tsx. Domain modules must not depend back on the top-level application assembler.`);
    }
  }
}

const mainSource = readProjectFile("electron/main.ts");
const legacyMainIpcChannels = new Set(baseline.legacyMainIpcChannels);
const lifecyclePrefixes = ["window:", "preview:", "line:"];
const directMainIpcPattern = /ipcMain\.(?:handle|on)\(\s*["']([^"']+)["']/g;
const directMainIpcChannels = new Set([...mainSource.matchAll(directMainIpcPattern)].map((match) => match[1]));

for (const match of mainSource.matchAll(directMainIpcPattern)) {
  const channel = match[1];
  const isLifecycleChannel = lifecyclePrefixes.some((prefix) => channel.startsWith(prefix));
  if (!isLifecycleChannel && !legacyMainIpcChannels.has(channel)) {
    failures.push(`electron/main.ts directly registers new non-window IPC channel "${channel}". Register it in a domain IPC module instead.`);
  }
}

for (const channel of legacyMainIpcChannels) {
  if (!directMainIpcChannels.has(channel)) {
    failures.push(`Legacy main IPC exception "${channel}" no longer exists in electron/main.ts. Remove the stale exception from the architecture baseline.`);
  }
}

for (const filePath of walkFiles(path.join(root, "electron")).filter((candidate) => candidate.endsWith(".ts"))) {
  const relativePath = path.relative(root, filePath).replaceAll("\\", "/");
  if (relativePath === "electron/main.ts") continue;
  const source = fs.readFileSync(filePath, "utf8");
  for (const match of source.matchAll(importPattern)) {
    if (/(?:^|\/)main$/.test(match[1])) {
      failures.push(`${relativePath} imports electron/main.ts. Services and IPC modules must receive dependencies from the main assembler instead of depending back on it.`);
    }
  }
}

if (failures.length > 0) {
  console.error("Architecture boundary checks failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    strictFileLimitsVerified: Object.keys(strictMaxLines).length,
    maintenanceFileLimitsVerified: Object.keys(maintenanceMaxLines).length,
    stableUiMigrationSurfacesGuarded: migrationSurfaceIds.size,
    rendererFilesChecked: rendererFiles.length,
    legacyMainIpcChannelsGuarded: legacyMainIpcChannels.size,
    directMainIpcChannelsFound: directMainIpcChannels.size
  }));
}
