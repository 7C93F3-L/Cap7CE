const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "..", "src", "renderer", "previewRequestGuard.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020
  },
  fileName: sourcePath
}).outputText;
const guardModule = new Module(sourcePath, module);
guardModule.filename = sourcePath;
guardModule.paths = Module._nodeModulePaths(path.dirname(sourcePath));
guardModule._compile(output, sourcePath);

const { createPreviewRequestGuard } = guardModule.exports;

(async () => {
  const guard = createPreviewRequestGuard();
  const firstRequestId = guard.begin();
  assert.equal(typeof firstRequestId, "number");
  assert.equal(guard.isCurrent(firstRequestId), true);

  guard.invalidate();
  assert.equal(guard.isCurrent(firstRequestId), false);
  const secondRequestId = guard.begin();
  assert.equal(guard.isCurrent(secondRequestId), true);

  let finishInspection;
  const inspection = new Promise((resolve) => {
    finishInspection = resolve;
  });
  const pendingOpen = (async () => {
    const requestId = guard.begin();
    await inspection;
    return guard.isCurrent(requestId);
  })();

  guard.invalidate();
  finishInspection();
  assert.equal(await pendingOpen, false);
  const requestAfterCleanup = guard.begin();
  assert.equal(guard.isCurrent(requestAfterCleanup), true);

  console.log(JSON.stringify({
    closeInvalidatesPendingPreview: true,
    unmountInvalidatesPendingPreview: true,
    strictModeCleanupAllowsNewPreview: true
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
