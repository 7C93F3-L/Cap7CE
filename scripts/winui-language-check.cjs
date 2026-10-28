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
  console.log(`WinUI language catalog passed: ${Object.keys(messages).length} paired messages`);
};
if (require.main === module) module.exports(path.resolve(__dirname, '..'));
