const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
// TypeScript does not copy source declaration files into its output tree.
// Preserve this shared contract at the relative location used by emitted declarations.
const target = path.join(root, 'core/artifacts/embedded-metadata/src/shared/embeddedMetadataTypes.d.ts');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(path.join(root, 'src/shared/embeddedMetadataTypes.d.ts'), target);
