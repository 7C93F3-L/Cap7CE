const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "..", "electron", "main.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
const registration = ast.statements.find((statement) =>
  ts.isExpressionStatement(statement)
  && ts.isCallExpression(statement.expression)
  && statement.expression.expression.getText(ast) === "ipcMain.handle"
  && statement.expression.arguments[0]?.text === "preview:open");
assert.ok(registration, "Exercise the actual Main preview handler");
const closeStatement = ast.statements.find((statement) => statement.getText(ast).startsWith("const closePreviewSession ="));
assert.ok(closeStatement?.getText(ast).includes("previewOpenRequestId += 1"), "Close invalidates the Main request counter");
const script = ts.transpileModule(registration.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;

function harness() {
  const pending = new Map();
  const sent = [];
  let handler;
  const sender = {};
  const context = {
    ipcMain: { handle: (_channel, callback) => { handler = callback; } },
    mainWindow: { isDestroyed: () => false, isVisible: () => true, webContents: sender },
    computerSearchRuntime: {},
    authorizeComputerSearchPreviewData: (data) => data,
    previewOpenRequestId: 0,
    embeddedMetadataPreviewCoordinator: { cancel() {}, start() {} },
    readPreviewEmbeddedMetadata: (filePath) => new Promise((resolve) => pending.set(filePath, resolve)),
    previewWindow: null,
    activePreviewData: null,
    activeSkimFolderStatsTask: null,
    latestSkimFolderStatsUpdate: null,
    latestPreviewContentSize: null,
    previewSessionActive: false,
    previewWindowLoaded: true,
    previewDockedShell: { startSession() {} },
    logPreviewLifecycle() {}, createPreviewWindow() {}, centerPreviewWindowForNewSession() {},
    revealPreviewWindow() {},
    sendActivePreviewData: () => sent.push(context.activePreviewData.sessionId)
  };
  for (const provider of ["Mobi", "Epub", "Font", "Archive", "Office", "Pdf"]) {
    context[`close${provider}PreviewSession`] = () => {};
  }
  vm.runInNewContext(script, context, { filename: sourcePath });
  return {
    sent,
    open: (sessionId, provider) => handler({ sender }, {
      sessionId, filePath: sessionId, fileSize: 1, modifiedAt: "2026-10-12",
      previewUrl: "cap7ce://test", provider, info: { path: sessionId },
      textPreview: { content: "sample" }, skimActive: false, theme: "dark"
    }),
    finish: (sessionId) => pending.get(sessionId)({ metadata: null, isCurrent: true }),
    close: () => { context.previewOpenRequestId++; context.previewSessionActive = false; }
  };
}

(async () => {
  for (const provider of ["image", "text", "audio", "video", "fileInfo", "folderInfo"]) {
    const switching = harness();
    const old = switching.open("old", provider);
    const latest = switching.open("latest", provider);
    switching.finish("latest");
    assert.equal(await latest, true);
    switching.finish("old");
    assert.equal(await old, false, `${provider}: metadata must not reopen an older preview`);
    assert.deepEqual(switching.sent, ["latest"]);

    const closing = harness();
    const request = closing.open("closing", provider);
    closing.close();
    closing.finish("closing");
    assert.equal(await request, false, `${provider}: close invalidates pending metadata`);
    assert.deepEqual(closing.sent, []);
  }
  console.log(JSON.stringify({ actualMainHandler: true, staleMetadataRejected: true, closedPreviewStaysClosed: true, providers: 6 }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
