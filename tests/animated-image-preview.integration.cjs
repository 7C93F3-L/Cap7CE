const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { app } = require("electron");

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngChunk = (type, data = Buffer.alloc(0)) => {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  return chunk;
};
const animatedPng = (frameCount) => {
  const control = Buffer.alloc(8);
  control.writeUInt32BE(frameCount, 0);
  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", Buffer.alloc(13)),
    pngChunk("acTL", control),
    pngChunk("IDAT"),
    pngChunk("IEND")
  ]);
};
app.whenReady().then(async () => {
  const {
    shouldUseDirectStaticSourceForPreview,
    shouldUseSourceFileForPreview
  } = require("../dist-electron/visualRenderService.js");
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-animated-preview-"));
  try {
    const apngPath = path.join(testRoot, "animated.png");
    const singleFramePath = path.join(testRoot, "single-frame.png");
    const staticPath = path.join(testRoot, "static.png");
    const staticJpegPath = path.join(testRoot, "static.jpg");
    const gifPath = path.join(testRoot, "animated.gif");
    await Promise.all([
      fs.writeFile(apngPath, animatedPng(3)),
      fs.writeFile(singleFramePath, animatedPng(1)),
      fs.writeFile(gifPath, "GIF89a"),
      sharp({ create: { width: 96, height: 72, channels: 4, background: "#336699" } }).png().toFile(staticPath),
      sharp({ create: { width: 96, height: 72, channels: 3, background: "#336699" } }).jpeg().toFile(staticJpegPath)
    ]);

    assert.equal(await shouldUseSourceFileForPreview(apngPath), true);
    assert.equal(await shouldUseSourceFileForPreview(singleFramePath), false);
    assert.equal(await shouldUseSourceFileForPreview(staticPath), true);
    assert.equal(await shouldUseSourceFileForPreview(staticJpegPath), true);
    assert.equal(await shouldUseSourceFileForPreview(gifPath), true);
    assert.equal(shouldUseDirectStaticSourceForPreview({ extension: ".jpg", fileSize: 20 * 1024 * 1024, width: 4000, height: 4000 }), true);
    assert.equal(shouldUseDirectStaticSourceForPreview({ extension: ".jpg", fileSize: 1, width: 4097, height: 1000 }), false);
    assert.equal(shouldUseDirectStaticSourceForPreview({ extension: ".jpg", fileSize: 1, width: 4001, height: 4000 }), false);
    assert.equal(shouldUseDirectStaticSourceForPreview({ extension: ".png", fileSize: 20 * 1024 * 1024 + 1, width: 1000, height: 1000 }), false);
    assert.equal(shouldUseDirectStaticSourceForPreview({ extension: ".avif", fileSize: 1, width: 1000, height: 1000 }), false);
    console.log(JSON.stringify({
      multiFrameApngUsesSource: true,
      malformedSingleFramePngFallsBackToCache: true,
      lightweightStaticSourcesUseOriginal: true,
      oversizedStaticSourcesUseCache: true,
      gifBehaviorPreserved: true
    }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
