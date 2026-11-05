const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { build } = require('esbuild');
const sharp = require('sharp');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap7ce-pdf-thumbnail-'));
  try {
    const library = path.join(root, 'thumbnail.cjs');
    await build({ entryPoints: ['core/node/visualRendering/shell/coreShellThumbnail.ts'], outfile: library, bundle: true, platform: 'node', format: 'cjs' });
    const { requestCoreShellThumbnail } = require(library);
    const executable = path.resolve('native/artifacts/core-visuals/v1/Cap7CE.Core.Visuals.exe');
    // A simple colored page checks actual rendering, rather than accepting a format icon.
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 400] /Resources << >> /Contents 4 0 R >>'];
    const content = '0 1 0 rg 0 0 200 400 re f\n';
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    let pdf = '%PDF-1.4\n', offsets = [0];
    objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const fixture = path.join(root, '目录 首页.pdf'); await fs.writeFile(fixture, pdf);
    const image = await requestCoreShellThumbnail(fixture, 300, executable, 15000, 'pdf');
    const metadata = await sharp(image).metadata(); assert.equal(metadata.width, 150); assert.equal(metadata.height, 300);
    const pixel = await sharp(image).removeAlpha().raw().toBuffer(); assert.ok(pixel[1] > 240 && pixel[0] < 15 && pixel[2] < 15);
    const invalid = path.join(root, 'invalid.pdf'); await fs.writeFile(invalid, 'not a PDF');
    await assert.rejects(requestCoreShellThumbnail(invalid, 300, executable, 15000, 'pdf'));
    if (process.argv[2]) {
      const start = performance.now();
      const actual = await requestCoreShellThumbnail(path.resolve(process.argv[2]), 300, executable, 15000, 'pdf');
      const dimensions = await sharp(actual).metadata(); assert.ok(dimensions.width <= 300 && dimensions.height <= 300);
      const output = path.join(os.tmpdir(), 'cap7ce-pdf-thumbnail-actual.png'); await fs.writeFile(output, actual);
      console.log(JSON.stringify({ actualFileMs: performance.now() - start, width: dimensions.width, height: dimensions.height, output }));
    }
    console.log('PDF native thumbnail: colored Unicode-path page, bounded dimensions and invalid document rejection passed.');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
