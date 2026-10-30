const fs = require('node:fs'), path = require('node:path');
const { build } = require('esbuild');
module.exports = async (root, output) => {
  const compiled = await build({ stdin: { contents: `
    import { zhCN } from './core/node/resourceCatalog/domain/localization/localization';
    import { getCatalogCommandReference } from './core/node/resourceCatalog/domain/commands/catalogCommandReference';
    import { defaultStableShortcutActions } from './core/node/resourceCatalog/domain/commands/shortcutActions';
    const reference = getCatalogCommandReference();
    export const settings = { text: Object.fromEntries(Object.entries(zhCN).filter(([key]) => ['stableSettings','settings','appearance','shortcut','common','theme'].includes(key.split('.')[0]))), shortcuts: defaultStableShortcutActions,
      commandGroups: reference.groups.map(group => ({...group, items: group.items.filter(item => !/^(line:|win:line(?:\\s|$))/.test(item.command))})).filter(group => group.items.length), dangerousCommands: reference.dangerousItems };
  `, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', write: false,
    loader: { '.svg': 'text' } });
  const generated = { exports: {} };
  new Function('module', 'exports', 'require', compiled.outputFiles[0].text)(generated, generated.exports, require);
  // Native WinUI excludes retired line and UI font-size settings.
  const retiredKeys = ['stableSettings.desc.line', 'settings.standbyLine', 'settings.showStandbyLineHint', 'settings.hideStandbyLineHint', 'shortcut.hideToLine'];
  for (const key of retiredKeys) delete generated.exports.settings.text[key];
  for (const key of Object.keys(generated.exports.settings.text)) if (key.includes('uiFontSize')) delete generated.exports.settings.text[key];
  generated.exports.settings.commandGroups=generated.exports.settings.commandGroups.map(group=>({...group,items:group.items.filter(item=>!item.command.startsWith('ui:font '))})).filter(group=>group.items.length);
  delete generated.exports.settings.shortcuts.hideToLine;
  fs.writeFileSync(path.join(output, 'settings-reference.json'), JSON.stringify(generated.exports.settings));
  const signature = fs.readFileSync(path.join(root, 'resources/icons/icon-signature-cap7ce.svg'), 'utf8');
  fs.writeFileSync(path.join(output, 'settings-signature.json'), JSON.stringify([...signature.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(match => match[1]).join(' ')));
};
