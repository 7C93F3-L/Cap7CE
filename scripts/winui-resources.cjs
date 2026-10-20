const fs = require('node:fs'), path = require('node:path');
const { build } = require('esbuild');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'shell/artifacts/assets');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const modulePath = path.join(output, 'formats.cjs');
  await build({ entryPoints: [path.join(root, 'electron/formatCapabilities.ts')], outfile: modulePath,
    bundle: true, platform: 'node', format: 'cjs', logLevel: 'error' });
  fs.writeFileSync(path.join(output, 'formats.json'), JSON.stringify(require(modulePath).fileFormatCapabilities));
  fs.copyFileSync(path.join(root, 'artifacts/metadata-worker/v1/extractors.json'), path.join(output, 'extractors.json'));
  require('./winui-sidebar-assets.cjs')(root, output);
  console.log('WinUI format resources generated from the existing registry.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
