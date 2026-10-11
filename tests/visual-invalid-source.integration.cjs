const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");
const root = path.join(os.tmpdir(), `cap7ce-invalid-visual-${process.pid}-${Date.now()}`);
app.setPath("userData", path.join(root, "profile"));

app.whenReady().then(async () => {
  const { readVisualSourceDimensions, readSharpSourceBuffer, maximumVisualInputBytes } = require("../dist-electron/visualSourceDimensions.js");
  const { ensureSkimThumbnailPath, shouldUseSourceFileForPreview } = require("../dist-electron/visualRenderService.js");
  await fs.mkdir(root, { recursive: true });
  const invalid = path.join(root, "invalid.webp");
  const valid = path.join(root, "valid.png");
  const oversized = path.join(root, "oversized.webp");
  try {
    await fs.writeFile(invalid, Buffer.from([2, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4]));
    // Before the fix, the native path-input failure kills Electron within this loop.
    for (let n = 0; n < 1000; n++) {
      await Promise.all([0, 1].map(() => assert.rejects(readVisualSourceDimensions(invalid))));
    }
    await assert.rejects(ensureSkimThumbnailPath(invalid));
    assert.equal(await shouldUseSourceFileForPreview(invalid), false);
    await fs.writeFile(valid, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
    assert.deepEqual(await readVisualSourceDimensions(valid), { width: 1, height: 1 });
    assert.ok((await fs.stat(await ensureSkimThumbnailPath(valid))).size > 0);
    const large = await fs.open(oversized, "w");
    try { await large.truncate(maximumVisualInputBytes + 1); } finally { await large.close(); }
    await assert.rejects(readSharpSourceBuffer(oversized), /读取上限/u);
    console.log("Malformed visual source errors stay recoverable; valid rendering and bounded input pass.");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
