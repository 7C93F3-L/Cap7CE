const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
module.exports = (root, output) => {
  const directory = path.join(root, 'native/artifacts/openexr');
  fs.mkdirSync(directory, { recursive: true });
  const run = (executable, args) => {
    const result = spawnSync(executable, args, { cwd: root, windowsHide: true, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw result.error || new Error('OpenEXR source preparation failed.');
  };
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'third_party/openexr/sources.json')));
  for (const source of manifest) {
    const archive = path.join(directory, source.archive);
    if (!fs.existsSync(archive)) {
      const partial = archive + '.partial';
      run('curl.exe', ['--fail', '--location', '--retry', '2', '--connect-timeout', '15', '--max-time', '300', '--output', partial, source.url]);
      if (createHash('sha256').update(fs.readFileSync(partial)).digest('hex') !== source.sha256) throw new Error(`Invalid ${source.name} source digest.`);
      fs.renameSync(partial, archive);
    }
    if (createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== source.sha256) throw new Error(`Invalid cached ${source.name} source digest.`);
    if (!fs.existsSync(path.join(directory, source.directory, 'CMakeLists.txt')))
      run('tar.exe', ['-xf', archive, '-C', directory]);
  }
  const notices = path.join(output, 'licenses/openexr'); fs.mkdirSync(notices, { recursive: true });
  for (const file of fs.readdirSync(path.join(root, 'third_party/openexr')))
    fs.copyFileSync(path.join(root, 'third_party/openexr', file), path.join(notices, file));
  return { openexr: path.join(directory, manifest[0].directory), imath: path.join(directory, manifest[1].directory) };
};
