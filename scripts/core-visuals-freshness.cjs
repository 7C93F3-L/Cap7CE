const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
function fingerprint(root) {
  const sources = 'native/Cap7CE.Core.Visuals';
  const files = fs.readdirSync(path.join(root, sources)).filter(name => /\.(?:cpp|h|rc|txt)$/.test(name)).map(name => `${sources}/${name}`);
  files.push('scripts/core-visuals-build.cjs', 'scripts/core-visuals-dependencies.cjs', 'scripts/core-visuals-freshness.cjs', 'package.json', 'build/icon.ico');
  files.push(...fs.readdirSync(path.join(root, 'third_party/openexr')).map(name => `third_party/openexr/${name}`));
  const hash = crypto.createHash('sha256');
  for (const file of files.sort()) { hash.update(file); hash.update(fs.readFileSync(path.join(root, file))); }
  return hash.digest('hex');
}
const directory = root => path.join(root, 'native/artifacts/core-visuals/v1');
exports.isFresh = root => {
  try { return fs.existsSync(path.join(directory(root), 'Cap7CE.Core.Visuals.exe')) && fs.readFileSync(path.join(directory(root), 'source-fingerprint.txt'), 'utf8') === fingerprint(root); }
  catch { return false; }
};
exports.record = root => fs.writeFileSync(path.join(directory(root), 'source-fingerprint.txt'), fingerprint(root));
