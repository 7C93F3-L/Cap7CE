const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, ".."), failures = [];
const files = new Map([
  ["electron/favoriteDirectories/favoriteDirectoryStore.ts", 150],
  ["electron/favoriteDirectories/favoriteDirectoryRules.ts", 75],
  ["electron/favoriteDirectories/favoriteDirectoryIpc.ts", 150],
  ["electron/favoriteDirectories/favoriteDirectoryBridge.ts", 50],
  ["src/shared/favoriteDirectoryTypes.d.ts", 50],
  ["src/renderer/favorite-directories/useFavoriteDirectories.ts", 75],
  ["src/renderer/favorite-directories/FavoriteDirectoryList.tsx", 100],
  ["src/shared/catalogWorkspaceTypes.d.ts", 35],
  ["src/renderer/catalog-workspace/catalogWorkspaceContexts.ts", 75],
  ["src/renderer/catalog-workspace/useCatalogWorkspaceContexts.ts", 45],
  ["src/renderer/computer-search/computerSearchTaskIdentity.ts", 35],
  ["src/renderer/computer-search/useViewportThumbnail.ts", 75],
  ["electron/computerSearchThumbnailLeases.ts", 90],
  ["electron/computerSearchThumbnailIpc.ts", 45],
  ["src/renderer/catalog-workspace/CatalogWorkspace.tsx", 90],
  ["src/renderer/catalog-workspace/CatalogSidebar.tsx", 35],
  ["src/renderer/catalog-workspace/useCatalogLayout.ts", 45],
  ["src/renderer/settings-window/SettingsMetadataBuildControl.tsx", 30],
  ["src/renderer/settings-window/SettingsIndexSection.tsx", 35],
  ["electron/settingsWindowBridge.ts", 25],
  ["src/shared/settingsWindowTypes.d.ts", 15],
  ["src/renderer/catalog-workspace/useCatalogAttributeAvailability.ts", 55],
  ["src/renderer/catalog-workspace/CatalogTopFilters.tsx", 35],
  ["src/renderer/catalog-workspace/CatalogAttributeNotice.tsx", 20],
  ["src/renderer/catalog-workspace/CatalogDetails.tsx", 45],
  ["src/renderer/computer-search/CatalogResultTile.tsx", 35],
  ["src/shared/catalogPresentationTypes.ts", 20],
  ["src/renderer/catalog-workspace/CatalogContextView.tsx", 90],
  ["src/renderer/catalog-workspace/CatalogQueryToolbar.tsx", 50],
  ["src/renderer/catalog-workspace/useCatalogDirectoryNavigation.ts", 50],
  ["src/renderer/catalog-workspace/CatalogDirectoryToolbar.tsx", 50],
  ["src/renderer/catalog-workspace/CatalogVolumeGrid.tsx", 35],
  ["src/renderer/catalog-workspace/CatalogApplicationRoot.tsx", 45],
  ["src/renderer/catalog-workspace/useCatalogApplicationPreferences.ts", 55],
  ["src/renderer/catalog-workspace/useCatalogWindowCommands.ts", 60],
  ["src/renderer/components/svgIdNamespace.ts", 50],
  ["src/renderer/components/SvgIcon.tsx", 30]
]);
for (const [name, maximum] of files) {
  const text = fs.readFileSync(path.join(root, name), "utf8");
  if (text.split(/\r?\n/).length > maximum) failures.push(`${name} exceeds its single-domain boundary (${maximum}).`);
  if (/CoreHostController|CoreMetadataProtocol|sql\.js|thumbnailOptimizationService|databaseService|from ["'][^"']*\/App(?:["']|\.)/.test(text)) failures.push(`${name} must not own indexing, extraction, caching or application state.`);
}
const store = fs.readFileSync(path.join(root, "electron/favoriteDirectories/favoriteDirectoryStore.ts"), "utf8");
const view = fs.readFileSync(path.join(root, "src/renderer/favorite-directories/FavoriteDirectoryList.tsx"), "utf8");
if (/window\.cap7ce|useFavoriteDirectories|computerSearch\./.test(view)) failures.push("Favorite presentation must receive state and actions through props.");
const contexts = fs.readFileSync(path.join(root, "src/renderer/catalog-workspace/catalogWorkspaceContexts.ts"), "utf8");
if (/window\.|DirectoryItem|WorkspaceSearchBridge|fs\.|setInterval|setTimeout/.test(contexts)) failures.push("Catalog context identity must not own source operations or legacy directory state.");
if (!contexts.includes("maximumCatalogContexts = 32") || !contexts.includes("openLimitReached: true")) failures.push("Catalog context capacity must be explicit and cannot silently evict an open view.");
for (const anchor of ["maximumFavoriteBytes + 1", 'new TextDecoder("utf-8", { fatal: true })',
  'fs.open(temporary, "wx")', "if (created) await fs.unlink(temporary)", "await fs.rename(temporary, this.filePath)"])
  if (!store.includes(anchor)) failures.push(`Favorite persistence is missing ${anchor}.`);
if (/fs\.(?:rm|rmdir|copyFile|cp|stat|lstat|readdir|readFile)\(/.test(store)) failures.push("Favorite persistence must not enumerate, copy or delete source folders, or perform unbounded reads.");
const rules = fs.readFileSync(path.join(root, "electron/favoriteDirectories/favoriteDirectoryRules.ts"), "utf8");
if (!rules.includes("maximumFavorites = 256") || !rules.includes("maximumFavoriteBytes = 1024 * 1024")) failures.push("Favorite state must retain explicit entry/byte limits.");
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
else console.log("Favorite configuration/source boundary passed.");
