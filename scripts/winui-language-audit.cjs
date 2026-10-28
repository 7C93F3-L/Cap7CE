const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const han = /\p{Script=Han}/u;

function scan(root) {
  const base = path.join(root, 'shell/Cap7CE.WinUI'), result = {};
  const walk = directory => fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() && !['bin', 'obj'].includes(entry.name) ? walk(file)
      : entry.isFile() && /\.(cs|xaml)$/.test(file) ? [file] : [];
  });
  for (const file of walk(base)) {
    const relative = path.relative(base, file).replaceAll('\\', '/');
    const source = fs.readFileSync(file, 'utf8');
    for (const line of source.split(/\r?\n/)) {
      if (/^\s*\/\//.test(line)) continue;
      const outside = line.replace(/"(?:\\.|[^"\\])*"/g, literal => {
        if (han.test(literal)) {
          const literals = result[relative] ??= {};
          literals[literal] = (literals[literal] ?? 0) + 1;
        }
        return '';
      });
      assert(!han.test(outside), `${relative}: unreviewed text outside a standard string literal: ${line.trim()}`);
    }
    // Literal UI copy must have a resource key; technical values and branding are invariant.
    for (const match of source.matchAll(/\bUi\.(?:Text|Heading|Button)\("((?:\\.|[^"\\])*)"/g))
      assert(['', '100%', '16', '↑', '↓', 'Cap7CE'].includes(match[1]) || relative === 'Controls/Settings/SettingsSignature.cs' && match[1] === '7C93F3-L &', `${relative}: literal UI text must use a language resource: ${match[1]}`);
  }
  return result;
}

function check(root) {
  const actual = scan(root);
  const audit = JSON.parse(fs.readFileSync(path.join(root, 'shell/Cap7CE.WinUI/Localization/source-audit.json'), 'utf8'));
  const expected = {};
  for (const entry of audit) {
    assert(entry.reason && Object.keys(entry.literals).length, `Missing audit rationale: ${entry.file}`);
    expected[entry.file] = entry.literals;
  }
  assert.deepEqual(actual, expected, 'Unreviewed Chinese source text or stale exceptions. Move UI copy to messages.json; only documented identities/preset data/glyph samples may remain.');
  const read = file => fs.readFileSync(path.join(root, 'shell/Cap7CE.WinUI', file), 'utf8');
  for (const file of ['Controllers/MetadataFilterPromptController.cs', 'Controls/Settings/MetadataMaintenanceView.cs'])
    assert(!read(file).includes('MetadataPanelState.DescribeError('), `${file}: use the localized error presenter`);
  assert(!read('Controllers/BrowseSession.cs').includes('BrowseScopeRules.IndexUnavailable('), 'browse errors must use resource keys');
  assert(!read('Controllers/AutoKeywordNoticeController.cs').includes('AutoKeywordNoticeText.Finished('), 'task notices must use localized snapshots');
  const options = [...read('Localization/LanguagePreferenceOptions.cs').matchAll(/\("([^"]+)","([^"]+)"\)/g)];
  const locales = read('Localization/LanguageCatalog.cs').match(/Languages=\[([^\]]+)\]/)[1].match(/"[^"]+"/g).map(value => value.slice(1, -1));
  assert.deepEqual(options.map(option => option[1]), ['system', ...locales], 'selector identities must cover the language catalog');
  const settings = read('Views/Settings/SettingsCatalog.cs');
  assert(settings.includes('LanguagePreferenceOptions.Choices[index].Id'), 'language selector must persist stable IDs');
  assert(!settings.includes('()=>DisabledChoice(["theme.system","language.chinese"'), 'language selector must be enabled after the final audit');
  const tasks = read('Services/AutoKeywordTasks.cs'), processor = read('Services/AutoKeywordProcessor.cs');
  const capture = tasks.indexOf('var language=Localization.AppLanguage.Session.Current'), dispatch = tasks.indexOf('return running=RunAsync');
  assert(capture >= 0 && dispatch > capture, 'AI language must be captured before asynchronous collection');
  assert(tasks.includes('new AutoKeywordProcessor(services,language)') && processor.includes('services.ModelContextFor(language)') && processor.includes('110000,language)'), 'model context and inference request must use the captured batch language');
  assert(!processor.includes('AppLanguage.Session.Current'), 'in-flight inference cannot read a newly selected UI language');
  console.log(`WinUI source language audit passed: ${audit.length} documented non-UI literal groups; selector and per-batch AI language boundaries verified`);
}
module.exports = check;
module.exports.scan = scan;
if (require.main === module) check(path.resolve(__dirname, '..'));
