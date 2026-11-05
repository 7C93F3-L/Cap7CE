const fs = require('node:fs'), path = require('node:path'), { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'shell/artifacts/model-preview');
const lock = require('../package-lock.json'), names = ['@babylonjs/core', '@babylonjs/loaders'];
fs.mkdirSync(output, { recursive: true });
for (const name of names) {
  const directory = path.join(root, 'node_modules', name), metadata = require(path.join(directory, 'package.json'));
  if (metadata.version !== '9.33.3' || metadata.version !== lock.packages[`node_modules/${name}`]?.version) throw Error(`Unlocked 3D viewer dependency: ${name}`);
  const notices = path.join(output, 'licenses', name); fs.mkdirSync(notices, { recursive: true });
  for (const file of fs.readdirSync(directory).filter(file => /^(license|notice)/i.test(file)))
    fs.copyFileSync(path.join(directory, file), path.join(notices, file));
}
buildSync({ entryPoints: [path.join(root, 'shell/Cap7CE.WinUI/Controls/ModelPreview/modelViewer.js')], outfile: path.join(output, 'viewer.js'),
  bundle: true, minify: true, platform: 'browser', format: 'esm', target: 'es2022', legalComments: 'eof' });
console.log(`Offline 3D preview built: ${fs.statSync(path.join(output, 'viewer.js')).size} bytes; locked Babylon.js, no Sandbox application.`);
