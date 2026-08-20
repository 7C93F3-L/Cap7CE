const fs = require("node:fs");
const path = require("node:path");
const { builtinModules } = require("node:module");

const root = path.resolve(__dirname, "..");
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, "architecture-boundaries-baseline.json"), "utf8"));
const failures = [];

const readProjectFile = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const physicalLineCount = (text) => text.split(/\r?\n/).length;

for (const [relativePath, maximum] of Object.entries(baseline.maxLines)) {
  const actual = physicalLineCount(readProjectFile(relativePath));
  if (actual > maximum) {
    failures.push(`${relativePath} grew to ${actual} lines (maximum ${maximum}). Add the feature to its domain module or explicitly revise the architecture plan and lower the boundary again after extraction.`);
  }
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

for (const match of mainSource.matchAll(directMainIpcPattern)) {
  const channel = match[1];
  const isLifecycleChannel = lifecyclePrefixes.some((prefix) => channel.startsWith(prefix));
  if (!isLifecycleChannel && !legacyMainIpcChannels.has(channel)) {
    failures.push(`electron/main.ts directly registers new non-window IPC channel "${channel}". Register it in a domain IPC module instead.`);
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
    hotFileLimitsVerified: Object.keys(baseline.maxLines).length,
    rendererFilesChecked: rendererFiles.length,
    legacyMainIpcChannelsGuarded: legacyMainIpcChannels.size,
    directMainIpcChannelsFound: [...mainSource.matchAll(directMainIpcPattern)].length
  }));
}
