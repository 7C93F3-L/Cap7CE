const fs = require('node:fs'), path = require('node:path');

// Production consumers only: tests and the old command-reference text are not UI roots.
module.exports = root => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const ui = 'shell/Cap7CE.WinUI/';
  const keys = new Set();
  const walk = directory => fs.readdirSync(path.join(root, directory), {withFileTypes: true}).flatMap(entry => {
    const file = directory + '/' + entry.name;
    return entry.isDirectory() && !['bin', 'obj'].includes(entry.name) ? walk(file)
      : entry.isFile() && /\.(cs|xaml)$/.test(file) ? [file] : [];
  });
  for (const file of walk(ui.slice(0, -1)))
    for (const match of read(file).matchAll(/"((?:language|ui|main|menu|native|navigation|help|settings|common|theme|appearance|stableSettings|shortcut)\.[A-Za-z0-9_.-]+)"/g))
      if (!match[1].endsWith('.')) keys.add(match[1]);
  for (const group of JSON.parse(read(ui + 'Localization/settings-help.json'))) {
    keys.add(group.titleKey);
    if (group.hintKey) keys.add(group.hintKey);
    for (const item of group.items) {
      keys.add(item.descriptionKey);
      if (item.exampleKey) keys.add(item.exampleKey);
    }
  }
  // Keys assembled from native settings sections and shortcut identities.
  for (const match of read(ui + 'Views/Settings/SettingsCatalog.cs').matchAll(/Mainline\("[^"]+","([^"]+)"/g))
    keys.add('stableSettings.section.' + match[1]);
  for (const match of read(ui + 'Models/ShortcutCatalog.cs').split('public static ShortcutBinding')[0].matchAll(/new\("([^"]+)"/g))
    keys.add('ui.shortcuts.action.' + match[1]);
  for (const state of ['running', 'stopped', 'missing', 'unknown', 'transition']) keys.add('ui.diagnostics.reader.' + state);
  for (const state of ['disabled', 'allowed', 'blocked', 'unknown']) keys.add('ui.diagnostics.notification.' + state);
  for (const state of ['index', 'metadata', 'ai', 'completed', 'partial', 'failed']) keys.add('ui.taskNotifications.' + state);
  for (const [file, family, start, end] of [
    ['Models/FormatRegistry.cs', 'kind', 'Categories', '};'],
    ['Models/FilterPresets.cs', 'time', 'Times=', ';']
  ]) {
    const source = read(ui + file), offset = source.indexOf(start);
    for (const match of source.slice(offset, source.indexOf(end, offset)).matchAll(/\("([^"]+)",/g))
      keys.add(`ui.filters.${family}.${match[1]}`);
  }
  const exclusions = read(ui + 'Models/MetadataExclusions.cs').split('folders=[')[1].split('];')[0];
  for (const match of exclusions.matchAll(/\("([^"]+)",/g)) keys.add('ui.exclusions.builtIn.' + match[1]);
  const generated = file => JSON.parse(read('shell/artifacts/assets/' + file));
  for (const group of generated('filter-advanced-options.json')) {
    keys.add(`ui.facts.advanced.${group.id}.title`);
    for (const option of group.options) keys.add(`ui.facts.advanced.${group.id}.${option.id}`);
  }
  for (const group of generated('filter-media-options.json'))
    for (const option of group.options) keys.add(`ui.facts.media.${group.id}.${option.id}`);
  for (const item of generated('filter-three-d-types.json')) keys.add(`ui.facts.type.${item.id}`);
  for (const item of generated('filter-visual-semantics.json')) keys.add(`ui.facts.color.${item.id}`);
  return keys;
};
