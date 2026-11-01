const fs = require('node:fs'), path = require('node:path');

// Publish-only material: never modify signed capability bundles or user data.
module.exports = (root, output) => {
  const assets = JSON.parse(fs.readFileSync(path.join(root, 'shell/artifacts/obj/Cap7CE.WinUI/project.assets.json')));
  const packageRoots = Object.keys(assets.packageFolders);
  const target = path.join(output, 'licenses');
  fs.mkdirSync(target, { recursive: true });
  const components = [];
  const copyPackage = (name, version, relative, fallback) => {
    const source = packageRoots.map(folder => path.join(folder, relative)).find(folder => fs.existsSync(folder));
    if (!source) throw new Error(`Missing restored notice source: ${name}/${version}`);
    const destination = path.join(target, 'nuget', name);
    fs.mkdirSync(destination, { recursive: true });
    const metadataFile = fs.readdirSync(source).find(file => file.endsWith('.nuspec'));
    const metadata = fs.readFileSync(path.join(source, metadataFile), 'utf8');
    const license = metadata.match(/<license\b[^>]*>([^<]+)<\/license>/)?.[1] ?? 'See distributed notices';
    const files = fs.readdirSync(source).filter(file => /license|notice/i.test(file) && fs.statSync(path.join(source, file)).isFile());
    for (const file of files) fs.copyFileSync(path.join(source, file), path.join(destination, file));
    if (fallback) {
      fs.copyFileSync(path.join(root, 'third_party', fallback, 'LICENSE'), path.join(destination, 'LICENSE'));
      fs.copyFileSync(path.join(root, 'third_party', fallback, 'SOURCE.txt'), path.join(destination, 'SOURCE.txt'));
      files.push('LICENSE', 'SOURCE.txt');
    }
    if (!files.some(file => /license/i.test(file))) throw new Error(`Missing complete license: ${name}/${version}`);
    components.push({ ecosystem: 'NuGet', name, version, license, files: files.sort().map(file => `nuget/${name}/${file}`) });
  };
  for (const [identity, library] of Object.entries(assets.libraries)) {
    if (library.type !== 'package' || identity.startsWith('Microsoft.Windows.SDK.BuildTools')) continue;
    const [name, version] = identity.split('/');
    copyPackage(name, version, library.path, name === 'Markdig' ? 'markdig' : name === 'AngleSharp' ? 'anglesharp' : null);
  }
  const config = JSON.parse(fs.readFileSync(path.join(output, 'shell/artifacts/winui/Cap7CE.WinUI.runtimeconfig.json')));
  for (const framework of config.runtimeOptions.includedFrameworks ?? []) {
    const name = framework.name + '.Runtime.win-x64';
    copyPackage(name, framework.version, `${name.toLowerCase()}/${framework.version}`);
  }
  const worker = path.join(output, 'artifacts/metadata-worker/v1');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  const npmNames = new Set(fs.readdirSync(path.join(worker, 'licenses')).flatMap(name => name.startsWith('@')
    ? fs.readdirSync(path.join(worker, 'licenses', name)).map(child => `${name}/${child}`) : [name]));
  for (const entry of fs.readdirSync(path.join(worker, 'node_modules'))) {
    const names = entry.startsWith('@') ? fs.readdirSync(path.join(worker, 'node_modules', entry)).map(child => `${entry}/${child}`) : [entry];
    for (const name of names) if (fs.existsSync(path.join(worker, 'node_modules', name, 'package.json'))) npmNames.add(name);
  }
  for (const name of [...npmNames].sort()) {
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json')));
    if (metadata.version !== lock.packages[`node_modules/${name}`]?.version) throw new Error(`Unlocked notice dependency: ${name}`);
    components.push({ ecosystem: 'npm', name, version: metadata.version, license: metadata.license ?? metadata.licenses,
      notices: `artifacts/metadata-worker/v1/${fs.existsSync(path.join(worker, 'licenses', name)) ? 'licenses' : 'node_modules'}/${name}` });
  }
  fs.writeFileSync(path.join(target, 'components.json'), JSON.stringify({ product: 'Cap7CE', version: require('../package.json').version,
    scope: 'WinUI NuGet/runtime and independent Node packages; Core and native helper notices remain beside their payloads', components }, null, 2) + '\n');
  console.log(`Runtime notices published: ${components.length} locked dependency records.`);
};
