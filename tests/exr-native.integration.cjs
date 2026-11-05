const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { build } = require('esbuild'), sharp = require('sharp');
const fixtures = require('./support/exr-fixtures.json');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap7ce-exr-native-'));
  const originalHost = process.env.CAP7CE_CORE_VISUAL_HOST;
  try {
    process.env.CAP7CE_CORE_VISUAL_HOST = path.resolve('native/artifacts/core-visuals/v1/Cap7CE.Core.Visuals.exe');
    const library = path.join(root, 'render.cjs'), registry = path.join(root, 'registry.cjs');
    await build({ entryPoints: ['core/node/visualRendering/shell/nativeDocumentRenderers.ts'], outfile: library, bundle: true, platform: 'node', format: 'cjs' });
    await build({ entryPoints: ['core/node/resourceCatalog/domain/formats/formatCapabilities.ts'], outfile: registry, bundle: true, platform: 'node', format: 'cjs' });
    const format = require(registry).fileFormatCapabilityByExtension.get('.exr');
    assert.ok(format.canThumbnail); assert.equal(format.previewKind, 'image'); assert.equal(format.canShellPreview, false); assert.equal(format.canAIIndex, false);
    const render = require(library).nativeDocumentSourceRenderers['.exr'];
    const paths = {};
    for (const [name, data] of Object.entries(fixtures)) {
      paths[name] = path.join(root, `样本 ${name}.exr`); await fs.writeFile(paths[name], Buffer.from(data, 'base64'));
    }
    for (const name of ['rgba', 'dwaaCombined', 'tiled']) {
      for (const edge of [300, 2560]) {
        const buffer = await render(paths[name], { maxWidth: edge, maxHeight: edge });
        const metadata = await sharp(buffer).metadata(); assert.equal(metadata.width, 2); assert.equal(metadata.height, 2);
        const pixel = await sharp(buffer).ensureAlpha().raw().toBuffer();
        assert.ok(pixel[0] >= 133 && pixel[0] <= 141, `${name}: linear 0.25 must display near sRGB 137`);
        assert.ok(Math.abs(pixel[0] - pixel[1]) < 3 && Math.abs(pixel[1] - pixel[2]) < 3, `${name}: select the gray composite, not the green render layer`);
        assert.equal(pixel[3], 255);
      }
    }
    const offset = await render(paths.offsetAlpha, { maxWidth: 300, maxHeight: 300 });
    const { data, info } = await sharp(offset).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 4); assert.equal(info.height, 4); assert.equal(data[3], 0);
    assert.equal(data[(1 * 4 + 1) * 4 + 3], 128); assert.ok(Math.abs(data[(1 * 4 + 1) * 4] - 137) < 2, 'unpremultiply before sRGB');
    await assert.rejects(render(paths.missingRgb, { maxWidth: 300, maxHeight: 300 }));
    const oversized = Buffer.from(fixtures.rgba, 'base64'), marker = Buffer.from('dataWindow\0box2i\0');
    const start = oversized.indexOf(marker) + marker.length + 4; assert.ok(start > marker.length + 4);
    oversized.writeInt32LE(4999, start + 8); oversized.writeInt32LE(4999, start + 12);
    const invalid = path.join(root, 'oversized.exr'); await fs.writeFile(invalid, oversized);
    await assert.rejects(render(invalid, { maxWidth: 300, maxHeight: 300 }));
    if (process.argv[2]) {
      const rows = [];
      for (const name of (await fs.readdir(process.argv[2])).filter(name => /\.exr$/i.test(name))) {
        for (const edge of [300, 2560]) {
          const start = performance.now(), output = await render(path.resolve(process.argv[2], name), { maxWidth: edge, maxHeight: edge });
          const metadata = await sharp(output).metadata(); assert.ok(metadata.width <= edge && metadata.height <= edge);
          rows.push({ name, edge, ms: Math.round(performance.now() - start) });
          if (process.argv[3]) { await fs.mkdir(process.argv[3], { recursive: true }); await fs.writeFile(path.join(process.argv[3], `native-${name}-${edge}.png`), output); }
        }
      }
      console.log(JSON.stringify(rows));
    }
    console.log('EXR native: DWAA composite selection, float sRGB, tiled RGB, alpha/data-window placement, no upscale, missing-color/oversized rejection and format routing passed.');
  } finally {
    if (originalHost === undefined) delete process.env.CAP7CE_CORE_VISUAL_HOST; else process.env.CAP7CE_CORE_VISUAL_HOST = originalHost;
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
