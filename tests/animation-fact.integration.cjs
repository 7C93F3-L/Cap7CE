const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { inspectAnimationFact } = require("../dist-electron/animationFactInspector.js");

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngChunk = (type, data = Buffer.alloc(0)) => {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  return chunk;
};
const png = (frames) => {
  const chunks = [pngSignature, pngChunk("IHDR", Buffer.alloc(13))];
  if (frames !== null) { const data = Buffer.alloc(8); data.writeUInt32BE(frames); chunks.push(pngChunk("acTL", data)); }
  return Buffer.concat([...chunks, pngChunk("IDAT"), pngChunk("IEND")]);
};
const riffChunk = (kind, data = Buffer.alloc(0)) => {
  const chunk = Buffer.alloc(8 + data.length + (data.length & 1));
  chunk.write(kind, 0, 4, "ascii"); chunk.writeUInt32LE(data.length, 4); data.copy(chunk, 8); return chunk;
};
const webp = (frames) => {
  const chunks = frames > 1 ? [riffChunk("ANIM"), ...Array.from({ length: frames }, () => riffChunk("ANMF"))] : [riffChunk("VP8 ")];
  const body = Buffer.concat(chunks); const header = Buffer.alloc(12); header.write("RIFF"); header.writeUInt32LE(body.length + 4, 4); header.write("WEBP", 8); return Buffer.concat([header, body]);
};
const staticGif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
const imageBlock = staticGif.subarray(19, staticGif.length - 1);
const animatedGif = Buffer.concat([staticGif.subarray(0, staticGif.length - 1), imageBlock, Buffer.from([0x3b])]);

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-animation-fact-"));
  try {
    const fixtures = { "static.gif": staticGif, "animated.gif": animatedGif, "static.webp": webp(1), "animated.webp": webp(2), "static.png": png(null), "single.png": png(1), "animated.png": png(3), "broken.gif": Buffer.from("GIF89a") };
    for (const [name, data] of Object.entries(fixtures)) await fs.writeFile(path.join(root, name), data);
    assert.equal(await inspectAnimationFact(path.join(root, "static.gif")), false);
    assert.equal(await inspectAnimationFact(path.join(root, "animated.gif")), true);
    assert.equal(await inspectAnimationFact(path.join(root, "static.webp")), false);
    assert.equal(await inspectAnimationFact(path.join(root, "animated.webp")), true);
    assert.equal(await inspectAnimationFact(path.join(root, "static.png")), false);
    assert.equal(await inspectAnimationFact(path.join(root, "single.png")), false);
    assert.equal(await inspectAnimationFact(path.join(root, "animated.png")), true);
    assert.equal(await inspectAnimationFact(path.join(root, "broken.gif")), null);
    console.log(JSON.stringify({ gifStaticAndAnimated: true, webpStaticAndAnimated: true, pngApngBoundary: true, corruptSafeFailure: true }));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
