const path = require('node:path');
const { build } = require('esbuild');
const root = path.resolve(__dirname, '..');

// Source domains remain separate; the sandbox loader receives one artifact.
build({ entryPoints: [path.join(root, 'electron/preload.ts')],
  outfile: path.join(root, 'dist-electron/preload.js'), bundle: true,
  platform: 'node', format: 'cjs', target: 'es2022', external: ['electron'],
  sourcemap: false, metafile: true, logLevel: 'error'
}).then(result => {
  const imports = Object.values(result.metafile.outputs).flatMap(output => output.imports);
  if (imports.some(item => !item.external || item.path !== 'electron'))
    throw new Error('Sandbox preload must depend only on the Electron bridge module.');
  console.log('Sandbox preload bundled with Electron as its only runtime dependency.');
}).catch(error => { console.error(error); process.exitCode = 1; });
