const path = require('node:path'), Module = require('node:module');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '../..'), cache = new Map();
module.exports = source => {
  const file = path.resolve(root, source);
  if (!file.startsWith(path.join(root, 'core', 'node') + path.sep)) throw Error('Canonical test source escaped Core Node.');
  if (cache.has(file)) return cache.get(file);
  const result = buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', target: 'node24',
    packages: 'external', write: false, logLevel: 'error' });
  const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded._compile(result.outputFiles[0].text, file); cache.set(file, loaded.exports);
  return loaded.exports;
};
