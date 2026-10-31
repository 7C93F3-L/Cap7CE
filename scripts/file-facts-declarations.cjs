const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
// Preserve the relative shared type import in emitted parser declarations.
for (const file of ['embeddedMetadataTypes.d.ts', 'storedMetadataTypes.d.ts', 'computerSearchFontTypes.d.ts', 'computerSearchModelTypes.d.ts', 'computerSearchDocumentTypes.d.ts', 'computerSearchThreeDTypes.d.ts', 'computerSearchTextDataTypes.d.ts', 'computerSearchArchiveTypes.d.ts', 'directoryBrowseTypes.d.ts', 'computerSearchFactTypes.d.ts', 'modelRuntimeTypes.d.ts', 'epubPreviewTypes.d.ts', 'mobiPreviewTypes.d.ts', 'bookPreviewTypes.d.ts', 'textPreviewTypes.d.ts', 'metadataBuildTypes.d.ts', 'archivePreviewTypes.d.ts', 'fontPreviewTypes.d.ts', 'visualRenderTypes.d.ts', 'visualCacheTypes.d.ts']) {
  const target = path.join(root, 'core/artifacts/file-facts/src/shared', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, 'src/shared', file), target);
}
