const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
// Preserve the relative shared type import in emitted parser declarations.
const target = path.join(root, 'core/artifacts/file-facts/src/shared/fontPreviewTypes.d.ts');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(path.join(root, 'src/shared/fontPreviewTypes.d.ts'), target);
