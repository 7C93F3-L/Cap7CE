const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), base = 'shell/Cap7CE.WinUI/';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
for (const [file, limit] of Object.entries({
  'Controls/ModelPreview/ModelPreviewView.cs': 120, 'Controls/ModelPreview/ModelPreviewDocument.cs': 35,
  'Controls/ModelPreview/modelLoader.js': 45, 'Controls/ModelPreview/modelScene.js': 65,
  'Controls/ModelPreview/modelViewer.js': 60, 'Models/ModelPreviewPolicy.cs': 40, 'Services/ModelPreviewResources.cs': 75
})) {
  const source = read(base + file);
  assert(source.trimEnd().split(/\r?\n/).length <= limit, `${file}: keep a single bounded preview responsibility`);
  assert(!/Sqlite|CatalogDatabase|Providers\.Request|HttpListener|TcpListener|Process\.Start/.test(source), `${file}: preview must stay independent of storage, IPC and local servers`);
}
const owner = read(base + 'Controls/ModelPreview/ModelPreviewView.cs');
assert(owner.includes('Unloaded+=(_,_)=>Dispose()') && owner.includes('token.Register(') && owner.includes('browser.Close()'), 'preview owner must release the browser on unload and cancellation');
assert(read(base + 'PreviewWindow.cs').includes('ModelPreviewView model)model.Dispose()'), 'window must release its model viewer before replacement');
assert(owner.includes('AreHostObjectsAllowed=false') && owner.includes('WebResourceRequestedFilter("*"') && owner.includes('e.Cancel=true'), 'offline viewer requires request interception and restricted browser capabilities');
assert(read('scripts/native-build.cjs').includes("node('model-preview-build.cjs')"), 'native build owns the offline viewer asset');
assert(read(base + 'Cap7CE.WinUI.csproj').includes('../artifacts/model-preview/**/*'), 'viewer assets and licenses must be published');
console.log('3D preview module, lifecycle and offline distribution boundaries passed.');
