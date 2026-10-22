const fs = require('node:fs'), path = require('node:path');
const { build } = require('esbuild');
module.exports = async (root, output) => {
  const compiled = await build({ stdin: { contents: `
    import { zhCN } from './electron/localization';
    import { CatalogQuickCommandSettingsRows } from './src/renderer/quick-commands/CatalogQuickCommandSettingsRows';
    import { defaultStableShortcutActions } from './src/renderer/shortcutActions';
    const reference = CatalogQuickCommandSettingsRows({}).props;
    export const settings = { text: Object.fromEntries(Object.entries(zhCN).filter(([key]) => ['stableSettings','settings','appearance','shortcut','common','theme'].includes(key.split('.')[0]))), shortcuts: defaultStableShortcutActions,
      commandGroups: reference.groups, dangerousCommands: reference.dangerousItems };
  `, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', write: false,
    loader: { '.svg': 'text' } });
  const generated = { exports: {} };
  new Function('module', 'exports', 'require', compiled.outputFiles[0].text)(generated, generated.exports, require);
  fs.writeFileSync(path.join(output, 'settings-reference.json'), JSON.stringify(generated.exports.settings));
};
