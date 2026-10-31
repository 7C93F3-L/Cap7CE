const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
// Preserve the relative shared type import in emitted parser declarations.
for (const file of ['fontPreviewTypes.d.ts', 'visualRenderTypes.d.ts', 'visualCacheTypes.d.ts']) {
  const target = path.join(root, 'core/artifacts/file-facts/src/shared', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, 'src/shared', file), target);
}
