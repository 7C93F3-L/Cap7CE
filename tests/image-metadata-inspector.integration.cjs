const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
sharp.cache(false);
sharp.concurrency(1);
const { inspectImageMetadata } = require("../dist-electron/metadataExtraction/imageMetadataInspector.js");

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-image-metadata-"));
  try {
    const signal = new AbortController().signal;
    const red = path.join(root, "红色.png"), transparent = path.join(root, "transparent.png"), rotated = path.join(root, "rotated.jpg");
    await sharp({ create: { width: 750, height: 500, channels: 3, background: "red" } }).png().toFile(red);
    await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } }).png().toFile(transparent);
    await sharp({ create: { width: 37, height: 23, channels: 3, background: "blue" } }).withMetadata({ orientation: 6 }).jpeg().toFile(rotated);
    const original = await fs.readFile(red);
    const result = await inspectImageMetadata(red, signal);
    assert.equal(result.width, 750); assert.equal(result.height, 500); assert.equal(result.isAnimated, false);
    assert.equal(result.properties.colorRatios.red, 10000); assert.equal(result.properties.colorBlockRatios.red, 10000);
    assert.equal((await inspectImageMetadata(transparent, signal)).properties.borderTransparentRatio, 10000);
    const portrait = await inspectImageMetadata(rotated, signal);
    assert.equal(portrait.width, 23); assert.equal(portrait.height, 37); assert.equal(portrait.isAnimated, false);
    assert.equal(portrait.properties.colorRatios.blue, 10000);

    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
    const animated = path.join(root, "animated.gif");
    await fs.writeFile(animated, Buffer.concat([gif.subarray(0, gif.length - 1), gif.subarray(19, gif.length - 1), Buffer.from([0x3b])]));
    assert.equal((await inspectImageMetadata(animated, signal)).isAnimated, true);
    const svg = path.join(root, "safe.svg");
    await fs.writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="red"/></svg>');
    assert.equal((await inspectImageMetadata(svg, signal)).isAnimated, null, "an uninspected animation domain is not classified as static");
    const unsafeSvg = path.join(root, "external.svg");
    await fs.writeFile(unsafeSvg, '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><image href="https://example.invalid/private.png"/></svg>');
    await assert.rejects(inspectImageMetadata(unsafeSvg, signal), /SVG/);
    const abort = new AbortController(); abort.abort();
    await assert.rejects(inspectImageMetadata(path.join(root, "missing.png"), abort.signal), /Abort/);
    assert.deepEqual(await fs.readFile(red), original, "metadata extraction never rewrites the source");
    assert.equal((await fs.readdir(root)).length, 6, "color extraction produces no thumbnails or other derived files");
    console.log("Direct image metadata keeps bounded color analysis, animation unknowns, orientation and read-only sources.");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
