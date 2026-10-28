const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');

module.exports = root => {
  const source = path.join(root, 'shell/Cap7CE.WinUI/Localization/messages.json');
  const messages = JSON.parse(fs.readFileSync(source, 'utf8'));
  const parameters = text => [...text.matchAll(/\{[A-Za-z][A-Za-z0-9]*(?::[^{}]+)?\}/g)].map(match => match[0]).sort();
  for (const [key, variants] of Object.entries(messages)) {
    assert.deepEqual(Object.keys(variants).sort(), ['en-US', 'zh-CN'], `${key}: language variants differ`);
    for (const [language, text] of Object.entries(variants))
      assert(typeof text === 'string' && text.trim().length, `${key}/${language}: empty translation`);
    assert.deepEqual(parameters(variants['zh-CN']), parameters(variants['en-US']), `${key}: named parameters differ`);
  }
  assert(Object.keys(messages).length, 'native language catalog must not be empty');
  assert.deepEqual(messages['language.tag'], {'zh-CN': 'zh-CN', 'en-US': 'en-US'}, 'native control language tags must be valid locale IDs');
  for (const [file, family] of [['Models/FormatRegistry.cs', 'kind'], ['Models/FilterPresets.cs', 'time']]) {
    // Read only the declared label array, never protocol or query identifiers.
    const text = fs.readFileSync(path.join(root, 'shell/Cap7CE.WinUI', file), 'utf8');
    const array = family === 'kind' ? text.slice(text.indexOf('Categories'), text.indexOf('};', text.indexOf('Categories')))
      : text.slice(text.indexOf('Times='), text.indexOf(';', text.indexOf('Times=')));
    for (const match of array.matchAll(/\("([^"]+)",\s*"[^"]+"\)/g))
      assert(messages[`ui.filters.${family}.${match[1]}`], `Missing ${family} preset translation: ${match[1]}`);
  }
  const presets = fs.readFileSync(path.join(root, 'shell/Cap7CE.WinUI/Models/FilterPresets.cs'), 'utf8');
  const sizePresets = presets.match(/Sizes=\[([\s\S]*?)\];/)[1].match(/\("/g);
  const filterBar = fs.readFileSync(path.join(root, 'shell/Cap7CE.WinUI/Controls/FilterBar.cs'), 'utf8');
  const sizeKeys = filterBar.match(/var sizeKeys=new\[\]\{([^}]+)\}/)[1].match(/"[^"]+"/g);
  assert.equal(sizeKeys.length, sizePresets.length, 'every size preset must have a language key');
  const help = JSON.parse(fs.readFileSync(path.join(root, 'shell/Cap7CE.WinUI/Localization/settings-help.json'), 'utf8'));
  for (const group of help) {
    assert(messages[group.titleKey], `Missing command group resource: ${group.titleKey}`);
    if (group.hintKey) assert(messages[group.hintKey], `Missing command hint resource: ${group.hintKey}`);
    for (const item of group.items) {
      assert(messages[item.descriptionKey], `Missing command resource: ${item.descriptionKey}`);
      if (item.exampleKey) assert(messages[item.exampleKey], `Missing command example resource: ${item.exampleKey}`);
      assert(!/^(line:|win:line)/.test(item.command), 'retired line commands cannot return in native help');
    }
  }
  const walk = directory => fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() && !['bin', 'obj'].includes(entry.name) ? walk(file) : entry.isFile() && /\.(?:cs|xaml)$/.test(file) ? [file] : [];
  });
  for (const file of walk(path.join(root, 'shell/Cap7CE.WinUI')))
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/"((?:language|ui|main|menu|native|navigation|help|settings|common|theme|appearance|stableSettings|shortcut)\.[A-Za-z0-9_.-]+)"/g))
      if (!match[1].endsWith('.')) assert(messages[match[1]], `${file}: unknown language key ${match[1]}`);
  console.log(`WinUI language catalog passed: ${Object.keys(messages).length} paired messages`);
};
if (require.main === module) module.exports(path.resolve(__dirname, '..'));
