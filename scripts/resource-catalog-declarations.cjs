const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
// Keep initial model state beside the existing localization singleton output.
const target = path.join(root, 'core/artifacts/resource-catalog/src/shared/modelRuntimeTypes.d.ts');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(path.join(root, 'src/shared/modelRuntimeTypes.d.ts'), target);
