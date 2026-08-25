const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const opentype = require("opentype.js");
const { app, BrowserWindow, protocol } = require("electron");

protocol.registerSchemesAsPrivileged([{
  scheme: "cap7cefonttest",
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
}]);
app.on("window-all-closed", () => {});

const {
  FontPreviewError,
  closeFontPreviewSession,
  isFontPreviewRequestAuthorized,
  maximumFontPreviewBytes,
  openFontPreviewSession
} = require("../dist-electron/fontPreviewService.js");

const createOpenTypeFixture = () => {
  const notdef = new opentype.Glyph({ name: ".notdef", advanceWidth: 500, path: new opentype.Path() });
  const latinPath = new opentype.Path();
  latinPath.moveTo(40, 0);
  latinPath.lineTo(300, 700);
  latinPath.lineTo(560, 0);
  latinPath.close();
  const latin = new opentype.Glyph({ name: "A", unicode: 65, advanceWidth: 600, path: latinPath });
  const font = new opentype.Font({
    familyName: "Cap7CE OTF Probe",
    styleName: "Regular",
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [notdef, latin]
  });
  return Buffer.from(font.toArrayBuffer());
};

const expectReason = async (promise, reason) => {
  await assert.rejects(promise, (error) => error instanceof FontPreviewError && error.reason === reason);
};

const run = async () => {
  await app.whenReady();
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-font-preview-"));
  const ttfPath = path.join(testRoot, "LiberationSans-Regular.ttf");
  const otfPath = path.join(testRoot, "probe.otf");
  const corruptPath = path.join(testRoot, "corrupt.ttf");
  const oversizedPath = path.join(testRoot, "oversized.otf");
  const cancellablePath = path.join(testRoot, "cancellable.otf");
  const unsupportedPath = path.join(testRoot, "unsupported.woff");
  const sourceTtf = path.join(__dirname, "..", "node_modules", "pdfjs-dist", "standard_fonts", "LiberationSans-Regular.ttf");
  const otfBuffer = createOpenTypeFixture();
  let window;
  try {
    await Promise.all([
      fs.copyFile(sourceTtf, ttfPath),
      fs.writeFile(otfPath, otfBuffer),
      fs.writeFile(cancellablePath, otfBuffer),
      fs.writeFile(corruptPath, "not a valid font"),
      fs.writeFile(unsupportedPath, "unsupported")
    ]);
    const oversized = await fs.open(oversizedPath, "w");
    await oversized.truncate(maximumFontPreviewBytes + 1);
    await oversized.close();
    const cancellable = await fs.open(cancellablePath, "r+");
    await cancellable.truncate(60 * 1024 * 1024);
    await cancellable.close();

    const ttfBefore = await fs.readFile(ttfPath);
    const ttf = await openFontPreviewSession("ttf", ttfPath, "en-US");
    assert.equal(ttf.familyName, "Liberation Sans");
    assert.equal(ttf.weight, 400);
    assert.equal(ttf.glyphCount > 600, true);
    assert.equal(ttf.supportsLatinSample, true);
    assert.deepEqual(await fs.readFile(ttfPath), ttfBefore);

    const otf = await openFontPreviewSession("otf", otfPath, "en-US");
    assert.equal(otf.familyName, "Cap7CE OTF Probe");
    assert.equal(otf.supportsLatinSample, false);
    assert.equal(otf.supportsChineseSample, false);
    const activePreview = { provider: "font", sessionId: "authorized", filePath: otfPath };
    assert.equal(isFontPreviewRequestAuthorized(activePreview, "authorized", otfPath), true);
    assert.equal(isFontPreviewRequestAuthorized(activePreview, "wrong-session", otfPath), false);
    assert.equal(isFontPreviewRequestAuthorized(activePreview, "authorized", ttfPath), false);
    assert.equal(isFontPreviewRequestAuthorized({ ...activePreview, provider: "fileInfo" }, "authorized", otfPath), false);

    const supersededOpen = openFontPreviewSession("same-session", otfPath, "zh-CN");
    const latestOpen = openFontPreviewSession("same-session", otfPath, "zh-CN");
    await assert.rejects(supersededOpen, (error) => error?.code === "ECANCELED");
    assert.equal((await latestOpen).familyName, "Cap7CE OTF Probe");

    await expectReason(openFontPreviewSession("corrupt", corruptPath, "zh-CN"), "invalidFont");
    await expectReason(openFontPreviewSession("oversized", oversizedPath, "zh-CN"), "tooLarge");
    await expectReason(openFontPreviewSession("unsupported", unsupportedPath, "zh-CN"), "failed");

    const pendingCancellation = openFontPreviewSession("cancel-me", cancellablePath, "en-US");
    let cancellationRequested = false;
    for (let attempt = 0; attempt < 100 && !cancellationRequested; attempt += 1) {
      cancellationRequested = closeFontPreviewSession("cancel-me");
      if (!cancellationRequested) await new Promise((resolve) => setTimeout(resolve, 1));
    }
    assert.equal(cancellationRequested, true);
    await assert.rejects(pendingCancellation, (error) => error?.code === "ECANCELED");

    await protocol.handle("cap7cefonttest", () => new Response(otfBuffer, {
      headers: { "Content-Type": "font/otf", "Cache-Control": "no-store" }
    }));

    window = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    await window.loadURL("data:text/html,<meta charset=utf-8><canvas></canvas>");
    const fontFaceResult = await window.webContents.executeJavaScript(`(async () => {
      const protocolResponse = await fetch("cap7cefonttest://preview");
      if (!protocolResponse.ok) throw new Error("Protocol font fetch failed: " + protocolResponse.status);
      const protocolBuffer = await protocolResponse.arrayBuffer();
      const protocolFace = await new FontFace("Cap7CEProtocolProbe", protocolBuffer).load();
      const valid = Uint8Array.from(atob(${JSON.stringify(otfBuffer.toString("base64"))}), character => character.charCodeAt(0)).buffer;
      const face = await new FontFace("Cap7CEProbe", valid).load();
      document.fonts.add(face);
      const presentBeforeDelete = document.fonts.has(face);
      const deleted = document.fonts.delete(face);
      let corruptRejected = false;
      try { await new FontFace("Cap7CECorrupt", new TextEncoder().encode("invalid").buffer).load(); }
      catch { corruptRejected = true; }
      return { protocolStatus: protocolFace.status, status: face.status, presentBeforeDelete, deleted, presentAfterDelete: document.fonts.has(face), corruptRejected };
    })()`);
    assert.deepEqual(fontFaceResult, {
      protocolStatus: "loaded",
      status: "loaded",
      presentBeforeDelete: true,
      deleted: true,
      presentAfterDelete: false,
      corruptRejected: true
    });

    console.log(JSON.stringify({
      ttfAndOtfMetadataRead: true,
      sourceFontUnchanged: true,
      invalidAndOversizedRejected: true,
      currentSessionPathAuthorizationEnforced: true,
      duplicateOpenSupersessionIsolated: true,
      activeWorkerCancellationHonored: true,
      customProtocolFontFaceLoaded: true,
      sandboxFontFaceLoaded: true,
      fontFaceRemovedAfterSession: true,
      damagedFontFaceRejected: true
    }));
  } finally {
    closeFontPreviewSession();
    window?.destroy();
    await fs.rm(testRoot, { recursive: true, force: true });
    app.quit();
  }
};

void run().catch((error) => {
  console.error(error);
  app.exit(1);
});
