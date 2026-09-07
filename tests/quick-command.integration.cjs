const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const projectRoot = path.join(__dirname, "..");
const moduleCache = new Map();
const loadTypeScriptModule = (filePath) => {
  const resolvedPath = path.resolve(filePath);
  if (moduleCache.has(resolvedPath)) return moduleCache.get(resolvedPath).exports;
  const source = fs.readFileSync(resolvedPath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: resolvedPath
  }).outputText;
  const loadedModule = { exports: {} };
  moduleCache.set(resolvedPath, loadedModule);
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) return require(specifier);
    const basePath = path.resolve(path.dirname(resolvedPath), specifier);
    for (const candidate of [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`]) {
      if (!fs.existsSync(candidate)) continue;
      return candidate.endsWith(".ts") || candidate.endsWith(".tsx")
        ? loadTypeScriptModule(candidate)
        : require(candidate);
    }
    throw new Error(`Cannot resolve ${specifier} from ${resolvedPath}`);
  };
  Function("require", "module", "exports", "__dirname", "__filename", output)(
    localRequire, loadedModule, loadedModule.exports, path.dirname(resolvedPath), resolvedPath
  );
  return loadedModule.exports;
};

const { quickCommandSpecs } = loadTypeScriptModule(path.join(projectRoot, "src/renderer/commandRegistry.ts"));
const { parseQuickCommand } = loadTypeScriptModule(path.join(projectRoot, "src/renderer/commandParser.ts"));
const { executeQuickCommand } = loadTypeScriptModule(path.join(projectRoot, "src/renderer/commandExecutor.ts"));
const { getQuickCommandGroups, getDangerousQuickCommandItems } = loadTypeScriptModule(
  path.join(projectRoot, "src/renderer/settings/QuickCommandSettingsRows.tsx")
);

const matchesSpec = (spec, command) => {
  if (spec.domain !== command.domain || spec.action !== command.action) return false;
  const fixedArgs = spec.fixedArgs ?? [];
  if (!fixedArgs.every((arg, index) => command.args[index]?.toLowerCase() === arg)) return false;
  const requiredArgs = spec.requiredArgs ?? 0;
  return requiredArgs === 0
    ? command.args.length === fixedArgs.length
    : command.args.length >= fixedArgs.length + requiredArgs;
};

const helpItems = [
  ...getQuickCommandGroups().flatMap((group) => group.items),
  ...getDangerousQuickCommandItems()
];
assert.equal(getQuickCommandGroups()[0].items[0].command, "set:", "Settings commands must remain the first group");
const coveredSpecs = new Set();
for (const item of helpItems) {
  const parsed = parseQuickCommand(item.command);
  assert.equal(parsed.type, "valid", `help command must parse: ${item.command}`);
  const specIndex = quickCommandSpecs.findIndex((spec) => matchesSpec(spec, parsed.command));
  assert.notEqual(specIndex, -1, `help command must match the registry: ${item.command}`);
  coveredSpecs.add(specIndex);
}
assert.equal(coveredSpecs.size, quickCommandSpecs.length, "help must cover every registered command form");
assert.equal(parseQuickCommand("idx:clear all").type, "search");
assert.equal(parseQuickCommand("cache:preview").type, "unknown");
assert.equal(parseQuickCommand("cache:model").type, "unknown");
assert.equal(parseQuickCommand("set:quick").type, "unknown");
assert.equal(parseQuickCommand("set:cmd").type, "unknown");
assert.equal(parseQuickCommand("app:hints on").type, "unknown");
assert.equal(parseQuickCommand("win:normal").type, "unknown");
assert.equal(parseQuickCommand("see:all").type, "unknown");
assert.equal(parseQuickCommand("see:dir").type, "missing-argument");
assert.equal(parseQuickCommand("see:scope").type, "unknown");
assert.equal(parseQuickCommand("tag:dir all").type, "search");
assert.equal(parseQuickCommand("tag:sort name").type, "search");
assert.equal(parseQuickCommand("ai:deep on").type, "unknown");

const calls = [];
const operation = async () => ({ ok: true });
const passiveContext = new Proxy({
  currentAppearanceColors: { themeColor: "#000000", accentColor: "#ffffff" },
  defaultAppearanceColors: { themeColor: "#000000", accentColor: "#ffffff" },
  defaultShortcutActions: {},
  directoryExists: () => true,
  getLlamaStopBlocker: () => null,
  setCurrentAiSearch: () => ({ ok: true })
}, { get: (target, property) => property in target ? target[property] : operation });
const context = new Proxy({
  currentAppearanceColors: { themeColor: "#000000", accentColor: "#ffffff" },
  defaultAppearanceColors: { themeColor: "#000000", accentColor: "#ffffff" },
  defaultShortcutActions: {},
  selectDirectory: (directoryName) => {
    calls.push(["directory", directoryName]);
    return true;
  },
  setSearchScope: (mode) => calls.push(["scope", mode]),
  setSkimScope: (mode) => calls.push(["skim-scope", mode]),
  setSkimHiddenFiles: (enabled) => calls.push(["skim-hidden", enabled]),
  setSkimSortDirection: (direction) => calls.push(["skim-sort-direction", direction]),
  setSkimSortField: (field) => calls.push(["skim-sort-field", field]),
  setCurrentAiSearch: (enabled) => {
    calls.push(["ai-search", enabled]);
    return { ok: true };
  },
  updateWindowMaterial: async (material) => calls.push(["material", material]),
  updateUiFontSize: async (size) => calls.push(["font", size]),
  resetWindow: async () => {
    calls.push(["window-reset"]);
    return { ok: true };
  },
  setSortField: (field) => calls.push(["sort-field", field]),
  addDirectory: async (directoryPath) => ({ ok: true, message: directoryPath }),
  updateEdgeCollapse: async (enabled) => calls.push(["edge", enabled]),
  updateSystemNotifications: async (enabled) => calls.push(["notify", enabled]),
  updateAutoCacheOptimization: async (enabled) => calls.push(["cache-auto", enabled]),
  updateAiRecognitionEnabled: async (enabled) => calls.push(["ai", enabled]),
  clearThumbnailCache: operation
}, { get: (target, property) => property in target ? target[property] : operation });

const execute = async (raw) => {
  const parsed = parseQuickCommand(raw);
  assert.equal(parsed.type, "valid", raw);
  const result = await executeQuickCommand(parsed.command, context);
  assert.notEqual(result.status, "pending", raw);
  return result;
};

(async () => {
  for (const item of helpItems) {
    const parsed = parseQuickCommand(item.command);
    const result = await executeQuickCommand(parsed.command, passiveContext);
    assert.notEqual(result.status, "pending", `help command must have an executor: ${item.command}`);
  }
  await execute("see:dir all");
  await execute("see:dir Pictures");
  await execute("see:scope default");
  await execute("see:scope all");
  await execute("see:scope custom");
  await execute("see:sort name");
  await execute("see:sort time");
  await execute("skim:scope default");
  await execute("skim:scope all");
  await execute("skim:scope custom");
  await execute("skim:sort asc");
  await execute("skim:sort desc");
  await execute("skim:sort name");
  await execute("skim:sort time");
  await execute("skim:hidden on");
  await execute("skim:hidden off");
  await execute("ui:acrylic");
  await execute("ui:mica");
  await execute("ui:font 12");
  await execute("ui:font 13");
  await execute("ui:font 14");
  await execute("ui:font 15");
  await execute("ui:font 16");
  await execute("win:reset");
  await execute("ai:on");
  await execute("ai:off");
  await execute("ai:search on");
  await execute("ai:search off");
  await execute("dir:add C:/Pictures");
  await execute("edge:on");
  await execute("app:notify off");
  await execute("cache:auto on");
  const thumbnailClear = await execute("cache:thumb");
  assert.equal(thumbnailClear.status, "confirmation");
  await thumbnailClear.confirmation.execute();
  assert.deepEqual(calls, [
    ["directory", "all"],
    ["directory", "Pictures"],
    ["scope", "skim"],
    ["scope", "all"],
    ["scope", "custom"],
    ["sort-field", "file_name"],
    ["sort-field", "modified_at"],
    ["skim-scope", "skim"], ["skim-scope", "all"], ["skim-scope", "custom"],
    ["skim-sort-direction", "asc"], ["skim-sort-direction", "desc"],
    ["skim-sort-field", "file_name"], ["skim-sort-field", "modified_at"],
    ["skim-hidden", true], ["skim-hidden", false],
    ["material", "acrylic"], ["material", "mica"],
    ["font", 12], ["font", 13], ["font", 14], ["font", 15], ["font", 16],
    ["window-reset"],
    ["ai", true], ["ai", false], ["ai-search", true], ["ai-search", false],
    ["edge", true], ["notify", false], ["cache-auto", true]
  ]);
  console.log(JSON.stringify({ registrySpecs: quickCommandSpecs.length, helpItems: helpItems.length, helpExecutorsVerified: helpItems.length, focusedPathsVerified: 33 }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
