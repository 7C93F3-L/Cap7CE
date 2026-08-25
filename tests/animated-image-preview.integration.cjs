const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
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
const staticPng = Buffer.concat([
  pngSignature,
  pngChunk("IHDR", Buffer.alloc(13)),
  pngChunk("IDAT"),
  pngChunk("IEND")
]);

app.whenReady().then(async () => {
  const { shouldUseSourceFileForPreview } = require("../dist-electron/visualRenderService.js");
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-animated-preview-"));
  try {
    const apngPath = path.join(testRoot, "animated.png");
    const singleFramePath = path.join(testRoot, "single-frame.png");
    const staticPath = path.join(testRoot, "static.png");
    const gifPath = path.join(testRoot, "animated.gif");
    await Promise.all([
      fs.writeFile(apngPath, animatedPng(3)),
      fs.writeFile(singleFramePath, animatedPng(1)),
      fs.writeFile(staticPath, staticPng),
      fs.writeFile(gifPath, "GIF89a")
    ]);

    assert.equal(await shouldUseSourceFileForPreview(apngPath), true);
    assert.equal(await shouldUseSourceFileForPreview(singleFramePath), false);
    assert.equal(await shouldUseSourceFileForPreview(staticPath), false);
    assert.equal(await shouldUseSourceFileForPreview(gifPath), true);
    console.log(JSON.stringify({
      multiFrameApngUsesSource: true,
      singleFramePngUsesCache: true,
      staticPngUsesCache: true,
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
