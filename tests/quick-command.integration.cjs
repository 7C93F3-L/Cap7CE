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

const calls = [];
const operation = async () => ({ ok: true });
const passiveContext = new Proxy({
  currentAppearanceColors: { themeColor: "#000000", accentColor: "#ffffff" },
  defaultAppearanceColors: { themeColor: "#000000", accentColor: "#ffffff" },
  defaultShortcutActions: {},
  directoryExists: () => true,
  getLlamaStopBlocker: () => null
}, { get: (target, property) => property in target ? target[property] : operation });
const context = new Proxy({
  currentAppearanceColors: { themeColor: "#000000", accentColor: "#ffffff" },
  defaultAppearanceColors: { themeColor: "#000000", accentColor: "#ffffff" },
  defaultShortcutActions: {},
  setSortField: (field) => calls.push(["sort-field", field]),
  setLabelVisible: (label, visible) => calls.push(["label", label, visible]),
  showSortLabel: () => calls.push(["show-sort"]),
  addDirectory: async (directoryPath) => ({ ok: true, message: directoryPath }),
  updateEdgeCollapse: async (enabled) => calls.push(["edge", enabled]),
  updateSystemNotifications: async (enabled) => calls.push(["notify", enabled]),
  updateAutoCacheOptimization: async (enabled) => calls.push(["cache-auto", enabled]),
  updateAiRecognitionEnabled: async (enabled) => calls.push(["ai-deep", enabled]),
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
  await execute("tag:sort name");
  await execute("tag:sort time");
  await execute("tag:show skim");
  await execute("tag:hide ai");
  await execute("dir:add C:/Pictures");
  await execute("edge:on");
  await execute("app:notify off");
  await execute("cache:auto on");
  await execute("ai:deep off");
  const thumbnailClear = await execute("cache:thumb");
  assert.equal(thumbnailClear.status, "confirmation");
  await thumbnailClear.confirmation.execute();
  assert.deepEqual(calls, [
    ["show-sort"], ["sort-field", "file_name"],
    ["show-sort"], ["sort-field", "modified_at"],
    ["label", "skimDisplay", true], ["label", "ai", false],
    ["edge", true], ["notify", false], ["cache-auto", true], ["ai-deep", false]
  ]);
  console.log(JSON.stringify({ registrySpecs: quickCommandSpecs.length, helpItems: helpItems.length, helpExecutorsVerified: helpItems.length, focusedPathsVerified: 10 }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
