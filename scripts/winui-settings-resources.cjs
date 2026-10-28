const fs = require('node:fs'), path = require('node:path');
const { build } = require('esbuild');
module.exports = async (root, output) => {
  const compiled = await build({ stdin: { contents: `
    import { zhCN } from './electron/localization';
    import { CatalogQuickCommandSettingsRows } from './src/renderer/quick-commands/CatalogQuickCommandSettingsRows';
    import { defaultStableShortcutActions } from './src/renderer/shortcutActions';
    const reference = CatalogQuickCommandSettingsRows({}).props;
    export const settings = { text: Object.fromEntries(Object.entries(zhCN).filter(([key]) => ['stableSettings','settings','appearance','shortcut','common','theme'].includes(key.split('.')[0]))), shortcuts: defaultStableShortcutActions,
      commandGroups: reference.groups.map(group => ({...group, items: group.items.filter(item => !/^(line:|win:line(?:\\s|$))/.test(item.command))})).filter(group => group.items.length), dangerousCommands: reference.dangerousItems };
  `, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', write: false,
    loader: { '.svg': 'text' } });
  const generated = { exports: {} };
  new Function('module', 'exports', 'require', compiled.outputFiles[0].text)(generated, generated.exports, require);
  // Native WinUI does not support line. Do not ship its legacy copy or bindings.
  const retiredKeys = ['stableSettings.desc.line', 'settings.standbyLine', 'settings.showStandbyLineHint', 'settings.hideStandbyLineHint', 'shortcut.hideToLine'];
  for (const key of retiredKeys) delete generated.exports.settings.text[key];
  delete generated.exports.settings.shortcuts.hideToLine;
  fs.writeFileSync(path.join(output, 'settings-reference.json'), JSON.stringify(generated.exports.settings));
  const signature = fs.readFileSync(path.join(root, 'src/renderer/assets/icons/icon-signature-cap7ce.svg'), 'utf8');
  fs.writeFileSync(path.join(output, 'settings-signature.json'), JSON.stringify([...signature.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(match => match[1]).join(' ')));
};
