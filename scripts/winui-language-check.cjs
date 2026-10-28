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
    return entry.isDirectory() && !['bin', 'obj'].includes(entry.name) ? walk(file) : entry.isFile() && file.endsWith('.cs') ? [file] : [];
  });
  for (const file of walk(path.join(root, 'shell/Cap7CE.WinUI')))
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/"((?:main|menu|native|navigation|help|settings|common|theme|appearance|stableSettings|shortcut)\.[A-Za-z0-9_.]+)"/g))
      if (!match[1].endsWith('.')) assert(messages[match[1]], `${file}: unknown language key ${match[1]}`);
  console.log(`WinUI language catalog passed: ${Object.keys(messages).length} paired messages`);
};
if (require.main === module) module.exports(path.resolve(__dirname, '..'));
